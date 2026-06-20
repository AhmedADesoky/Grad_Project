import uuid
import graphene
import logging
from django.utils import timezone

Logger = logging.getLogger(__name__)


# ── Types ─────────────────────────────────────────────────────────────────────

class ChatSessionType(graphene.ObjectType):
    session_id    = graphene.String()
    title         = graphene.String()
    pdf_url       = graphene.String()
    pdf_filename  = graphene.String()
    message_count = graphene.Int()
    created_at    = graphene.String()
    updated_at    = graphene.String()


class ChatMessageType(graphene.ObjectType):
    message_id     = graphene.String()
    session_id     = graphene.String()
    role           = graphene.String()
    content        = graphene.String()
    intent         = graphene.String()
    rating         = graphene.String()
    rating_comment = graphene.String()
    timestamp      = graphene.String()


class SendMessageResult(graphene.ObjectType):
    message_id = graphene.String()
    reply      = graphene.String()
    intent     = graphene.String()
    title      = graphene.String()   # set only on the first exchange


# ── Queries ───────────────────────────────────────────────────────────────────

class Query(graphene.ObjectType):

    Get_Chat_Sessions = graphene.List(
        ChatSessionType,
        User_Id = graphene.String(required=True),
    )

    Get_Chat_Messages = graphene.List(
        ChatMessageType,
        Session_Id = graphene.String(required=True),
        User_Id    = graphene.String(required=True),
    )

    # ── resolvers ────────────────────────────────────────────────────────────

    def resolve_Get_Chat_Sessions(self, info, User_Id):
        from Chatbot.models import ChatSession
        sessions = (
            ChatSession.objects
            .filter(User_Id=User_Id)
            .order_by('-Updated_At')[:50]
        )
        return [
            ChatSessionType(
                session_id    = s.Session_Id,
                title         = s.Title,
                pdf_url       = s.Pdf_Url,
                pdf_filename  = s.Pdf_Filename,
                message_count = s.Message_Count,
                created_at    = s.Created_At.isoformat() if s.Created_At else None,
                updated_at    = s.Updated_At.isoformat() if s.Updated_At else None,
            )
            for s in sessions
        ]

    def resolve_Get_Chat_Messages(self, info, Session_Id, User_Id):
        from Chatbot.models import ChatMessage
        messages = (
            ChatMessage.objects
            .filter(Session_Id=Session_Id, User_Id=User_Id)
            .order_by('Timestamp')
        )
        return [
            ChatMessageType(
                message_id     = m.Message_Id,
                session_id     = m.Session_Id,
                role           = m.Role,
                content        = m.Content,
                intent         = m.Intent,
                rating         = m.Rating,
                rating_comment = m.Rating_Comment,
                timestamp      = m.Timestamp.isoformat() if m.Timestamp else None,
            )
            for m in messages
        ]


# ── Mutations ─────────────────────────────────────────────────────────────────

class SendChatMessage(graphene.Mutation):
    """
    Send a user message and receive an AI reply.
    On the FIRST message of a session, also returns a generated title.
    Optionally accepts a base64 PDF to attach to the session.
    """

    class Arguments:
        Session_Id   = graphene.String(required=True)
        User_Id      = graphene.String(required=True)
        Message      = graphene.String(required=True)
        User_Level   = graphene.String()          # CEFR level, e.g. "B1"
        Pdf_Base64   = graphene.String()          # base64-encoded PDF (first attach only)
        Pdf_Filename = graphene.String()

    Output = SendMessageResult

    def mutate(self, info, Session_Id, User_Id, Message, User_Level='B1',
               Pdf_Base64=None, Pdf_Filename=None):
        from Chatbot.models import ChatSession, ChatMessage
        from Chatbot.services.Chat_Engine import chat, generate_title, extract_and_chunk_pdf

        try:
            # ── Get or create session ─────────────────────────────────────────
            session, created = ChatSession.objects.get_or_create(
                Session_Id = Session_Id,
                defaults   = {
                    'User_Id':    User_Id,
                    'Title':      'New conversation',
                },
            )

            # ── Handle PDF attachment (once per session) ──────────────────────
            if Pdf_Base64 and not session.Pdf_Text:
                try:
                    clean_text, chunks, pdf_url = extract_and_chunk_pdf(
                        Pdf_Base64, Pdf_Filename or 'document.pdf'
                    )
                    session.Pdf_Text     = clean_text
                    session.Chunks       = chunks
                    session.Pdf_Url      = pdf_url
                    session.Pdf_Filename = Pdf_Filename or 'document.pdf'
                    session.save()
                except Exception as e:
                    Logger.error("PDF extraction failed: %s", e)

            # ── Load conversation history ─────────────────────────────────────
            history_qs = (
                ChatMessage.objects
                .filter(Session_Id=Session_Id)
                .order_by('Timestamp')
                .values('Role', 'Content')
            )
            history = [{'role': m['Role'], 'content': m['Content']} for m in history_qs]

            # ── Run chat engine ───────────────────────────────────────────────
            chunks = session.Chunks or []
            result = chat(
                session_id  = Session_Id,
                user_id     = User_Id,
                message     = Message,
                history     = history,
                user_level  = User_Level,
                chunks      = chunks,
            )

            # ── Persist user message ──────────────────────────────────────────
            ChatMessage.objects.create(
                Message_Id = str(uuid.uuid4()),
                Session_Id = Session_Id,
                User_Id    = User_Id,
                Role       = 'user',
                Content    = Message,
                Intent     = result['intent'],
            )

            # ── Persist assistant reply ───────────────────────────────────────
            ai_msg = ChatMessage.objects.create(
                Message_Id  = str(uuid.uuid4()),
                Session_Id  = Session_Id,
                User_Id     = User_Id,
                Chunks_Used = result.get('chunks_used') or [],
                Role        = 'assistant',
                Content     = result['reply'],
                Intent      = result['intent'],
            )

            # ── Update session metadata ───────────────────────────────────────
            session.Message_Count = (session.Message_Count or 0) + 2
            session.Updated_At    = timezone.now()

            # Generate title on first exchange (was "New conversation")
            generated_title = None
            if session.Title == 'New conversation' and len(history) == 0:
                try:
                    generated_title = generate_title(Message, result['reply'])
                    session.Title   = generated_title
                except Exception as e:
                    Logger.warning("Title generation failed: %s", e)

            session.save()

            return SendMessageResult(
                message_id = ai_msg.Message_Id,
                reply      = result['reply'],
                intent     = result['intent'],
                title      = generated_title,
            )

        except Exception as e:
            Logger.error("SendChatMessage failed: %s", e)
            return SendMessageResult(
                message_id = str(uuid.uuid4()),
                reply      = "I'm sorry, I encountered an error. Please try again.",
                intent     = "general",
                title      = None,
            )


class RateChatMessage(graphene.Mutation):
    """Thumbs up / down feedback on an AI message."""

    class Arguments:
        Message_Id     = graphene.String(required=True)
        User_Id        = graphene.String(required=True)
        Rating         = graphene.String(required=True)   # 'good' | 'bad'
        Rating_Comment = graphene.String()

    success = graphene.Boolean()
    error   = graphene.String()

    def mutate(self, info, Message_Id, User_Id, Rating, Rating_Comment=''):
        from Chatbot.models import ChatMessage
        try:
            msg = ChatMessage.objects.get(Message_Id=Message_Id, User_Id=User_Id, Role='assistant')
            msg.Rating         = Rating
            msg.Rating_Comment = Rating_Comment or ''
            msg.save()
            return RateChatMessage(success=True)
        except ChatMessage.DoesNotExist:
            return RateChatMessage(success=False, error='Message not found')
        except Exception as e:
            return RateChatMessage(success=False, error=str(e))


class DeleteChatSession(graphene.Mutation):
    """Delete a session and all its messages."""

    class Arguments:
        Session_Id = graphene.String(required=True)
        User_Id    = graphene.String(required=True)

    success = graphene.Boolean()
    error   = graphene.String()

    def mutate(self, info, Session_Id, User_Id):
        from Chatbot.models import ChatSession, ChatMessage
        try:
            ChatMessage.objects.filter(Session_Id=Session_Id, User_Id=User_Id).delete()
            ChatSession.objects.filter(Session_Id=Session_Id, User_Id=User_Id).delete()
            return DeleteChatSession(success=True)
        except Exception as e:
            return DeleteChatSession(success=False, error=str(e))


class RenameChatSession(graphene.Mutation):
    """Manually rename a chat session."""

    class Arguments:
        Session_Id = graphene.String(required=True)
        User_Id    = graphene.String(required=True)
        New_Title  = graphene.String(required=True)

    success = graphene.Boolean()
    error   = graphene.String()

    def mutate(self, info, Session_Id, User_Id, New_Title):
        from Chatbot.models import ChatSession
        try:
            session        = ChatSession.objects.get(Session_Id=Session_Id, User_Id=User_Id)
            session.Title  = New_Title[:200]
            session.save()
            return RenameChatSession(success=True)
        except ChatSession.DoesNotExist:
            return RenameChatSession(success=False, error='Session not found')
        except Exception as e:
            return RenameChatSession(success=False, error=str(e))


class CreateChatSession(graphene.Mutation):
    """Explicitly create a new empty session and return its ID."""

    class Arguments:
        User_Id = graphene.String(required=True)

    session_id = graphene.String()
    error      = graphene.String()

    def mutate(self, info, User_Id):
        from Chatbot.models import ChatSession
        try:
            session = ChatSession.objects.create(
                Session_Id = str(uuid.uuid4()),
                User_Id    = User_Id,
                Title      = 'New conversation',
            )
            return CreateChatSession(session_id=session.Session_Id)
        except Exception as e:
            return CreateChatSession(error=str(e))


# ── Top-level schema registrations ───────────────────────────────────────────

class Mutation(graphene.ObjectType):
    Send_Chat_Message  = SendChatMessage.Field()
    Rate_Chat_Message  = RateChatMessage.Field()
    Delete_Chat_Session = DeleteChatSession.Field()
    Rename_Chat_Session = RenameChatSession.Field()
    Create_Chat_Session = CreateChatSession.Field()
