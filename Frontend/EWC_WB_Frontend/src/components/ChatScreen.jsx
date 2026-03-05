import React, { useState, useRef, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { useSidebar } from '../contexts/SidebarContext';
import {
    Send,
    Bot,
    User,
    Plus,
    MessageSquare,
    MoreVertical,
    Trash2,
    Edit2,
    Sparkles,
    Command,
    AlignLeft
} from 'lucide-react';

export function ChatScreen() {
    const { isCollapsed } = useSidebar();

    // State for chats and current active chat
    const [chats, setChats] = useState([
        {
            id: '1',
            title: 'Current Level Assessment',
            messages: [
                { id: 1, text: "Hello! I'm your AI English coach. Let's practice! How are you today?", sender: 'bot', timestamp: new Date(Date.now() - 1000 * 60 * 5) }
            ],
            updatedAt: new Date()
        }
    ]);
    const [activeChatId, setActiveChatId] = useState('1');
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [editingChatId, setEditingChatId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [activeMenuId, setActiveMenuId] = useState(null);

    const messagesEndRef = useRef(null);

    const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [activeChat?.messages, isTyping]);

    // Click outside to close menu
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (activeMenuId && !event.target.closest('.chat-menu-container')) {
                setActiveMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeMenuId]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const newMessage = {
            id: Date.now(),
            text: inputValue,
            sender: 'user',
            timestamp: new Date()
        };

        setChats(prev => prev.map(chat => {
            if (chat.id === activeChatId) {
                return {
                    ...chat,
                    messages: [...chat.messages, newMessage],
                    updatedAt: new Date()
                };
            }
            return chat;
        }));

        setInputValue('');
        setIsTyping(true);

        // Simulate AI response
        setTimeout(() => {
            const aiResponse = {
                id: Date.now() + 1,
                text: "That's great to hear! Would you like to practice some specific vocabulary or grammar today?",
                sender: 'bot',
                timestamp: new Date()
            };

            setChats(prev => prev.map(chat => {
                if (chat.id === activeChatId) {
                    return {
                        ...chat,
                        messages: [...chat.messages, aiResponse],
                        updatedAt: new Date()
                    };
                }
                return chat;
            }));
            setIsTyping(false);
        }, 1500);
    };

    const startNewChat = () => {
        const newId = Date.now().toString();
        const newChat = {
            id: newId,
            title: 'New Conversation',
            messages: [{ id: 1, text: "Hello! What would you like to practice today?", sender: 'bot', timestamp: new Date() }],
            updatedAt: new Date()
        };
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newId);
    };

    const deleteChat = (id, e) => {
        e.stopPropagation();
        setChats(prev => prev.filter(c => c.id !== id));
        if (activeChatId === id) {
            setActiveChatId(chats.find(c => c.id !== id)?.id || null);
        }
        setActiveMenuId(null);
    };

    const startEditing = (chat, e) => {
        e.stopPropagation();
        setEditingChatId(chat.id);
        setEditTitle(chat.title);
        setActiveMenuId(null);
    };

    const saveEdit = (e) => {
        if (e.key === 'Enter' || e.type === 'blur') {
            if (editTitle.trim()) {
                setChats(prev => prev.map(chat =>
                    chat.id === editingChatId ? { ...chat, title: editTitle.trim() } : chat
                ));
            }
            setEditingChatId(null);
        }
    };

    const formatTime = (date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="h-screen bg-background flex overflow-hidden">
            <Sidebar />
            <Navbar />


            <div className={`flex-1 flex transition-all duration-300 pt-16 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>

                {/* Chat History Sidebar */}
                <div className="w-80 bg-card border-r border-border/50 flex flex-col h-full hidden md:flex">
                    {/* Header */}
                    <div className="p-4 border-b border-border/50">
                        <button
                            onClick={startNewChat}
                            className="w-full flex items-center justify-center gap-2 bg-[#3b82f6] hover:bg-blue-600 text-white py-3 px-4 rounded-xl transition-colors font-medium"
                        >
                            <Plus className="w-5 h-5" />
                            New Conversation
                        </button>
                    </div>

                    {/* History List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 px-2">Recent Chats</p>
                        {chats.map(chat => (
                            <div
                                key={chat.id}
                                onClick={() => setActiveChatId(chat.id)}
                                className={`group relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 chat-menu-container ${activeChatId === chat.id
                                    ? 'bg-blue-50 border border-blue-100'
                                    : 'hover:bg-muted/50 border border-transparent'
                                    }`}
                            >
                                <div className={`p-2 rounded-lg ${activeChatId === chat.id ? 'bg-blue-100 text-[#3b82f6]' : 'bg-muted text-muted-foreground'}`}>
                                    <MessageSquare className="w-4 h-4" />
                                </div>

                                <div className="flex-1 min-w-0 pr-6">
                                    {editingChatId === chat.id ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            className="w-full bg-white border border-blue-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onBlur={saveEdit}
                                            onKeyDown={saveEdit}
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <p className={`text-sm truncate ${activeChatId === chat.id ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>
                                            {chat.title}
                                        </p>
                                    )}
                                </div>

                                {/* Options Menu Toggle */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(activeMenuId === chat.id ? null : chat.id);
                                    }}
                                    className={`absolute right-2 p-1.5 rounded-lg text-muted-foreground hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity ${activeMenuId === chat.id ? 'opacity-100 bg-black/5' : ''}`}
                                >
                                    <MoreVertical className="w-4 h-4" />
                                </button>

                                {/* Dropdown Menu */}
                                {activeMenuId === chat.id && (
                                    <div className="absolute right-2 top-10 w-36 bg-card rounded-xl border border-border/50 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                                        <button
                                            onClick={(e) => startEditing(chat, e)}
                                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted text-left"
                                        >
                                            <Edit2 className="w-4 h-4 text-muted-foreground" />
                                            Rename
                                        </button>
                                        <button
                                            onClick={(e) => deleteChat(chat.id, e)}
                                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-destructive/10 text-destructive text-left"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col h-full bg-muted/30">

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                        {!activeChat ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                                    <Bot className="w-8 h-8 text-[#3b82f6]" />
                                </div>
                                <p>Start a new conversation to begin practicing!</p>
                            </div>
                        ) : (
                            activeChat.messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`flex gap-4 max-w-3xl animate-fade-in ${message.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                                >
                                    {/* Avatar */}
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${message.sender === 'user' ? 'bg-[#3b82f6] text-white' : 'bg-card border border-border'
                                        }`}>
                                        {message.sender === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-6 h-6 text-[#3b82f6]" />}
                                    </div>

                                    {/* Message Bubble */}
                                    <div className={`flex flex-col gap-1 ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed ${message.sender === 'user'
                                            ? 'bg-[#3b82f6] text-white rounded-tr-sm'
                                            : 'bg-card border border-border/50 text-foreground rounded-tl-sm'
                                            }`}>
                                            {message.text}
                                        </div>
                                        <span className="text-xs text-muted-foreground px-1">
                                            {formatTime(message.timestamp)}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}

                        {isTyping && (
                            <div className="flex gap-4 max-w-3xl animate-fade-in">
                                <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-6 h-6 text-[#3b82f6]" />
                                </div>
                                <div className="bg-card border border-border/50 px-5 py-4 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 md:p-6 bg-card/80 backdrop-blur-md border-t border-border/50">
                        <form
                            onSubmit={handleSendMessage}
                            className="max-w-4xl mx-auto relative flex items-center"
                        >
                            <button
                                type="button"
                                className="absolute left-4 p-2 text-muted-foreground hover:text-[#3b82f6] transition-colors"
                                title="Commands"
                            >
                                <Command className="w-5 h-5" />
                            </button>

                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Type your message to practice English..."
                                className="w-full bg-card border border-border rounded-full py-4 pl-14 pr-16 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/20 focus:border-[#3b82f6]/50 transition-all"
                                disabled={!activeChatId}
                            />

                            <button
                                type="submit"
                                disabled={!inputValue.trim() || !activeChatId}
                                className="absolute right-2 p-2.5 bg-[#3b82f6] text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-[#3b82f6] transition-all"
                            >
                                <Send className="w-5 h-5 ml-0.5" />
                            </button>
                        </form>
                        <p className="text-center text-xs text-muted-foreground mt-3">
                            AI English Coach can make mistakes. Consider verifying important language rules.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}
