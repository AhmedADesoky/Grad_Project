import React, { useState, useRef, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { useSidebar } from '../contexts/SidebarContext';
import {
    Send,
    Bot,
    User,
    Plus,
    MoreVertical,
    Trash2,
    Edit2,
} from 'lucide-react';

export function ChatScreen() {
    const { isCollapsed } = useSidebar();
    const textareaRef = useRef(null);

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

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (activeMenuId && !event.target.closest('.chat-menu-container')) {
                setActiveMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeMenuId]);

    const handleInputChange = (e) => {
        setInputValue(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e);
        }
    };

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
                return { ...chat, messages: [...chat.messages, newMessage], updatedAt: new Date() };
            }
            return chat;
        }));

        setInputValue('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setIsTyping(true);

        setTimeout(() => {
            const aiResponse = {
                id: Date.now() + 1,
                text: "That's great to hear! Would you like to practice some specific vocabulary or grammar today?",
                sender: 'bot',
                timestamp: new Date()
            };
            setChats(prev => prev.map(chat => {
                if (chat.id === activeChatId) {
                    return { ...chat, messages: [...chat.messages, aiResponse], updatedAt: new Date() };
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
                <div className="w-64 border-r border-border/50 flex flex-col h-full hidden md:flex">
                    <div className="p-3">
                        <button
                            onClick={startNewChat}
                            className="w-full flex items-center gap-2 hover:bg-muted/60 text-foreground py-2.5 px-3 rounded-xl transition-colors font-medium text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            New chat
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 space-y-0.5">
                        <p className="text-xs font-semibold text-muted-foreground px-2 mb-2">Your chats</p>
                        {chats.map(chat => (
                            <div
                                key={chat.id}
                                onClick={() => setActiveChatId(chat.id)}
                                className={`group relative flex items-center gap-2 px-2 py-2.5 rounded-lg cursor-pointer transition-all chat-menu-container hover:bg-muted/50`}
                            >
                                <div className="flex-1 min-w-0 pr-6">
                                    {editingChatId === chat.id ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            className="w-full bg-background border border-border rounded px-2 py-0.5 text-sm outline-none"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onBlur={saveEdit}
                                            onKeyDown={saveEdit}
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <p className="text-sm truncate text-foreground/80">{chat.title}</p>
                                    )}
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === chat.id ? null : chat.id); }}
                                    className={`absolute right-1 p-1 rounded-md text-muted-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity ${activeMenuId === chat.id ? 'opacity-100' : ''}`}
                                >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                </button>

                                {activeMenuId === chat.id && (
                                    <div className="absolute right-1 top-9 w-36 bg-card rounded-xl border border-border/50 overflow-hidden z-50">
                                        <button onClick={(e) => startEditing(chat, e)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted text-left">
                                            <Edit2 className="w-4 h-4 text-muted-foreground" /> Rename
                                        </button>
                                        <button onClick={(e) => deleteChat(chat.id, e)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-destructive/10 text-destructive text-left">
                                            <Trash2 className="w-4 h-4" /> Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col h-full">

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto">
                        {!activeChat ? (
                            <div className="h-full flex flex-col items-center justify-center">
                                <h1 className="text-2xl font-semibold text-foreground">What's on the agenda today?</h1>
                            </div>
                        ) : (
                            <div className="max-w-3xl mx-auto w-full px-4 py-8 space-y-8">
                                {activeChat.messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={`flex gap-3 animate-fade-in ${message.sender === 'user' ? 'justify-end' : ''}`}
                                    >
                                        {message.sender === 'bot' && (
                                            <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <Bot className="w-4 h-4 text-[#3b82f6]" />
                                            </div>
                                        )}

                                        <div className={`flex flex-col gap-1 max-w-[80%] ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
                                            {message.sender === 'bot' ? (
                                                <p className="text-foreground text-[15px] leading-relaxed">{message.text}</p>
                                            ) : (
                                                <div className="px-5 py-3.5 rounded-2xl bg-[#3b82f6] text-white text-[15px] leading-relaxed">
                                                    {message.text}
                                                </div>
                                            )}
                                            <span className="text-xs text-muted-foreground px-1">{formatTime(message.timestamp)}</span>
                                        </div>

                                        {message.sender === 'user' && (
                                            <div className="w-8 h-8 rounded-full bg-[#3b82f6] text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <User className="w-4 h-4" />
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {isTyping && (
                                    <div className="flex gap-3 animate-fade-in">
                                        <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
                                            <Bot className="w-4 h-4 text-[#3b82f6]" />
                                        </div>
                                        <div className="flex items-center gap-1.5 pt-2">
                                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 md:p-6">
                        <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto">
                            <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-[#3b82f6]/20 focus-within:border-[#3b82f6]/50 transition-all shadow-sm">
                                <button
                                    type="button"
                                    className="p-1 text-muted-foreground hover:text-[#3b82f6] transition-colors flex-shrink-0 self-end mb-0.5"
                                    title="Add attachment"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>

                                <textarea
                                    ref={textareaRef}
                                    value={inputValue}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask anything..."
                                    rows={1}
                                    className="flex-1 bg-transparent resize-none focus:outline-none text-foreground placeholder:text-muted-foreground text-sm py-1.5 max-h-[200px]"
                                    disabled={!activeChatId}
                                />

                                <button
                                    type="submit"
                                    disabled={!inputValue.trim() || !activeChatId}
                                    className="p-2 bg-foreground text-background rounded-full hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 self-end"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-center text-xs text-muted-foreground mt-3">
                                AI English Coach can make mistakes. Consider verifying important language rules.
                            </p>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
