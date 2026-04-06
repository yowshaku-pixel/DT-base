import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, X, MessageSquare, Loader2, Sparkles, Trash2, Key, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { MaintenanceRecord, ChatMessage } from '../types';
import { analyzeMaintenanceData } from '../services/aiService';
import { cn } from '../lib/utils';

// Extend window for AI Studio APIs
declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface AIChatAssistantProps {
  records: MaintenanceRecord[];
}

export default function AIChatAssistant({ records }: AIChatAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorType, setErrorType] = useState<'quota' | 'rate' | 'other' | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setErrorType(null);

    try {
      const response = await analyzeMaintenanceData(input, records, messages);
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      let content = `Sorry, I encountered an error: ${error.message || 'Unknown error'}`;
      
      if (error.message?.includes('AI_DAILY_QUOTA_EXCEEDED')) {
        setErrorType('quota');
        content = "### ⚠️ Quota Exceeded\nYou have reached your daily limit for AI analysis. To continue, you can wait until tomorrow or use your own Gemini API key via the **Gear Icon (API Config)** at the top right.";
      } else if (error.message?.includes('AI_RATE_LIMIT_EXCEEDED')) {
        setErrorType('rate');
        content = "### ⏳ Rate Limit Reached\nYou're sending questions too fast! Please wait about 60 seconds and try again.";
      }

      const errorMessage: ChatMessage = {
        role: 'assistant',
        content,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenKeySelector = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // After selecting a key, the environment usually refreshes or injects the key.
      // We can clear the error and let the user try again.
      setErrorType(null);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setErrorType(null);
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-colors",
          isOpen ? "bg-red-500 text-white" : "bg-purple-600 text-white"
        )}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 w-[90vw] md:w-[400px] h-[600px] max-h-[70vh] bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-gradient-to-r from-purple-900/20 to-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-white uppercase tracking-wider">DT.Base AI</h3>
                  <p className="text-[10px] text-white/40 font-mono uppercase">Fleet Analyst Active</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleOpenKeySelector}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-purple-400"
                  title="Change API Key"
                >
                  <Key className="w-4 h-4" />
                </button>
                <button 
                  onClick={clearChat}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-red-400"
                  title="Clear Chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-white/20" />
                  </div>
                  <div>
                    <p className="text-sm text-white/60 font-display">How can I help you today?</p>
                    <p className="text-xs text-white/30 font-mono mt-1">Ask me to summarize logs, analyze patterns, or find specific truck info.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 w-full">
                    {[
                      "Summarize recent work",
                      "Which truck has most issues?",
                      "Find logs for plate KCN 851 S",
                      "Analyze recurring mechanical problems"
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setInput(suggestion);
                        }}
                        className="text-[10px] text-left px-3 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-white/40"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div
                    className={cn(
                      "p-3 rounded-2xl text-sm",
                      msg.role === 'user' 
                        ? "bg-purple-600 text-white rounded-tr-none" 
                        : "bg-white/5 border border-white/10 text-white/80 rounded-tl-none"
                    )}
                  >
                    <div className="markdown-body prose prose-invert prose-sm max-w-none">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  </div>
                  <span className="text-[8px] text-white/20 font-mono mt-1 uppercase">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              
              {errorType === 'quota' && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                    <AlertCircle className="w-4 h-4" />
                    QUOTA EXCEEDED
                  </div>
                  <p className="text-[10px] text-white/60 font-mono">
                    You've hit the daily limit. You can use your own Gemini API key to get higher limits.
                  </p>
                  <button
                    onClick={handleOpenKeySelector}
                    className="w-full py-2 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Key className="w-3 h-3" />
                    USE MY OWN API KEY
                  </button>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center gap-2 text-white/40 font-mono text-[10px] animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI IS ANALYZING...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 border-t border-white/10 bg-zinc-900/50">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask DT.Base AI..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-500 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
