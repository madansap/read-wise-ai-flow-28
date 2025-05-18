
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Send } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { useReading } from '@/contexts/ReadingContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  context_used?: boolean;
}

const AIAssistantPanel = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { currentBookId, currentPage, currentPageText } = useReading();

  // Load conversation history on mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;

      // Check for an existing conversation ID in localStorage
      const storedConversationId = localStorage.getItem('conversationId');
      if (storedConversationId) {
        setConversationId(storedConversationId);
        loadMessages(storedConversationId);
      } else {
        // If no conversation ID exists, create a new one
        const newConversationId = uuidv4();
        localStorage.setItem('conversationId', newConversationId);
        setConversationId(newConversationId);
      }
    };

    loadHistory();
  }, [user]);

  // Load messages from database
  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedMessages: Message[] = data.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at).toISOString(),
        context_used: msg.context_used
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error("Error loading messages:", error);
      toast({
        title: "Error",
        description: "Failed to load message history",
        variant: "destructive",
      });
    }
  };

  // Ensure we're passing the bookId to the AI assistant when asking questions
  const handleAskQuestion = async () => {
    if (!message.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      
      // Add message to history immediately for better UX
      const userMessage: Message = {
        id: uuidv4(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, userMessage]);
      setMessage('');
      
      if (!currentBookId) {
        toast({
          title: "Error",
          description: "No book selected",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Call the AI assistant function with the book ID, page number, and user message
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          userQuestion: message,
          bookId: currentBookId,
          pageNumber: currentPage,
          bookContent: currentPageText,
          mode: 'chat'
        }
      });

      if (response.error) {
        throw new Error(response.error.message || "Error processing request");
      }

      // Add AI response to message history
      const aiResponse: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: response.data.response || "Sorry, I couldn't process your request",
        timestamp: new Date().toISOString(),
        context_used: response.data.context_used || false
      };

      setMessages(prev => [...prev, aiResponse]);

      // Save to conversation history if needed
      
    } catch (error) {
      console.error("Error asking question:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to get response",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAskQuestion();
  };

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="flex-grow flex flex-col p-4">
        <ScrollArea className="flex-grow">
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="flex flex-col max-w-[75%]">
                  <div className={`rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                    {msg.content}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {msg.role === 'assistant' && msg.context_used && (
                      <span className="mr-2">
                        <span className="font-medium">AI</span> used book content
                      </span>
                    )}
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder="Ask a question about the book..."
            value={message}
            onChange={handleInputChange}
            disabled={isSubmitting}
          />
          <Button type="submit" disabled={isSubmitting}>
            <Send className="h-4 w-4 mr-2" />
            Ask
          </Button>
        </form>
      </div>
    </Card>
  );
};

export default AIAssistantPanel;
