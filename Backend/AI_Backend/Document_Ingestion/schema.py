import graphene
from graphene import Boolean, Field, Int, List, Mutation, ObjectType, String

from .models import Document_Analysis
from .services.System_Pipeline import analyze_document_file
from middleware.auth import require_auth


class Document_Classification_Type(ObjectType):
    Level = String()
    Confidence = graphene.Float()
    Description = String()
    Probabilities = graphene.JSONString()


class Document_Feedback_Type(ObjectType):
    Corrected_Text = String()
    Overall_Score = graphene.Float()
    Grammar_Score = graphene.Float()
    Vocab_Score = graphene.Float()
    Punct_Score = graphene.Float()
    Detected_Issues = graphene.JSONString()
    Errors = graphene.JSONString()        # [{type, label, start, end, text, suggestion, explanation}]
    Error_Trend = String()                # improving / consistent / declining
    Dominant_Error = String()             # grammar / spelling / punctuation / vocabulary / word_order / style
    Severity = graphene.Float()           # model score_head: 0 = perfect, 1 = many errors
    Fluency = graphene.Float()            # model score_head: 0 = disfluent, 1 = fluent
    Feedback_Text = String()              # model-generated (Flan-T5) overall feedback


class Document_Analysis_Type(ObjectType):
    Analysis_Id = String()
    User_Id = String()
    Pdf_Url = String()
    Pdf_Storage_Path = String()
    File_Name = String()
    Page_Count = Int()
    Extraction_Tool = String()
    Page_Results = graphene.JSONString()
    Clean_Text = String()
    Classification = Field(Document_Classification_Type)
    Feedback = Field(Document_Feedback_Type)
    Status = String()
    Error_Message = String()
    Created_At = String()
    Updated_At = String()


class Document_Analysis_Connection_Type(ObjectType):
    Count = Int()
    Results = List(Document_Analysis_Type)


def convert_document_to_type(record):
    if record is None:
        return None

    return Document_Analysis_Type(
        Analysis_Id=record.Analysis_Id,
        User_Id=record.User_Id,
        Pdf_Url=record.Pdf_Url,
        Pdf_Storage_Path=record.Pdf_Storage_Path,
        File_Name=record.File_Name,
        Page_Count=record.Page_Count,
        Extraction_Tool=record.Extraction_Tool,
        Page_Results=record.Page_Results,
        Clean_Text=record.Clean_Text,
        Classification=Document_Classification_Type(
            Level=record.Classification_Level,
            Confidence=record.Classification_Confidence,
            Description=record.Classification_Description,
            Probabilities=record.Classification_Probabilities,
        ),
        Feedback=Document_Feedback_Type(
            Corrected_Text=record.Feedback_Corrected_Text,
            Overall_Score=record.Feedback_Overall_Score,
            Grammar_Score=record.Feedback_Grammar_Score,
            Vocab_Score=record.Feedback_Vocab_Score,
            Punct_Score=record.Feedback_Punct_Score,
            Detected_Issues=record.Feedback_Detected_Issues,
            Errors=record.Feedback_Errors,
            Error_Trend=record.Feedback_Error_Trend,
            Dominant_Error=record.Feedback_Dominant_Error,
            Severity=record.Feedback_Severity,
            Fluency=record.Feedback_Fluency,
            Feedback_Text=record.Feedback_Text,
        ),
        Status=record.Status,
        Error_Message=record.Error_Message,
        Created_At=str(record.Created_At) if record.Created_At else None,
        Updated_At=str(record.Updated_At) if record.Updated_At else None,
    )


def convert_document_payload_to_type(payload):
    if not payload:
        return None

    classification = payload.get('classification', {}) or {}
    feedback = payload.get('feedback', {}) or {}

    return Document_Analysis_Type(
        Analysis_Id=payload.get('analysis_id'),
        User_Id=payload.get('user_id'),
        Pdf_Url=payload.get('pdf_url'),
        Pdf_Storage_Path=payload.get('pdf_storage_path'),
        File_Name=payload.get('file_name'),
        Page_Count=payload.get('page_count'),
        Extraction_Tool=payload.get('extraction_tool'),
        Page_Results=payload.get('page_results'),
        Clean_Text=payload.get('clean_text'),
        Classification=Document_Classification_Type(
            Level=classification.get('level'),
            Confidence=classification.get('confidence'),
            Description=classification.get('description'),
            Probabilities=classification.get('probabilities'),
        ),
        Feedback=Document_Feedback_Type(
            Corrected_Text=feedback.get('corrected_text') or feedback.get('corrected'),
            Overall_Score=feedback.get('overall_score'),
            Grammar_Score=feedback.get('grammar_score'),
            Vocab_Score=feedback.get('vocab_score'),
            Punct_Score=feedback.get('punct_score'),
            Detected_Issues=feedback.get('detected_issues'),
            Errors=feedback.get('errors'),
            Error_Trend=feedback.get('error_trend'),
            Dominant_Error=feedback.get('dominant_error'),
            Severity=feedback.get('severity'),
            Fluency=feedback.get('fluency'),
            Feedback_Text=feedback.get('feedback_text') or feedback.get('feedback'),
        ),
        Status=payload.get('status'),
        Error_Message=payload.get('error_message'),
        Created_At=payload.get('created_at'),
        Updated_At=payload.get('updated_at'),
    )


class Analyze_PDF_Document_Mutation(Mutation):
    class Arguments:
        Pdf_Base64 = String(required=False)
        Pdf_Path = String(required=False)
        Pdf_Url = String(required=False)
        File_Name = String(required=False)
        User_Id = String(required=False)
        Save_To_Database = Boolean(default_value=True)
        Use_OCR = Boolean(default_value=True)

    Success = Boolean()
    Result = Field(Document_Analysis_Type)
    Error = String()

    @require_auth
    def mutate(self, info, Pdf_Base64=None, Pdf_Path=None, Pdf_Url='', File_Name='', User_Id=None, Save_To_Database=True, Use_OCR=True):
        result = analyze_document_file(
            pdf_base64=Pdf_Base64,
            pdf_path=Pdf_Path,
            pdf_url=Pdf_Url or '',
            user_id=User_Id or '',
            file_name=File_Name or '',
            save_to_database=Save_To_Database,
            use_ocr=Use_OCR,
        )

        if not result.get('success'):
            return Analyze_PDF_Document_Mutation(Success=False, Error=result.get('error', 'Document analysis failed'))

        return Analyze_PDF_Document_Mutation(
            Success=True,
            Result=convert_document_payload_to_type(result['document']),
        )


class Document_Ingestion_Query(ObjectType):
    Get_User_Document_Analyses = Field(
        Document_Analysis_Connection_Type,
        User_Id=String(required=True),
        Limit=Int(default_value=10),
        Offset=Int(default_value=0),
    )
    Get_Latest_Document_Analysis = Field(Document_Analysis_Type, User_Id=String(required=False))

    @require_auth
    def resolve_Get_User_Document_Analyses(self, info, User_Id, Limit=10, Offset=0):
        rows = Document_Analysis.objects.filter(User_Id=User_Id).order_by('-Created_At')[Offset:Offset + Limit]
        results = [convert_document_to_type(row) for row in rows]
        return Document_Analysis_Connection_Type(Count=len(results), Results=results)

    @require_auth
    def resolve_Get_Latest_Document_Analysis(self, info, User_Id=None):
        queryset = Document_Analysis.objects.all()
        if User_Id:
            queryset = queryset.filter(User_Id=User_Id)
        row = queryset.order_by('-Created_At').first()
        return convert_document_to_type(row)


class Document_Ingestion_Mutation(ObjectType):
    Analyze_PDF_Document = Analyze_PDF_Document_Mutation.Field()
