
import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Message } from '@/types/message';

export function useMessages(bookId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Load conversation history on mount or when bookId changes
  useEffect(() => {
    const loadHistory = async () => {
      if (!bookId) return;

      // Check for an existing conversation ID in localStorage
      const storedConversationId = localStorage.getItem(`conversation_${bookId}`);
      if (storedConversationId) {
        setConversationId(storedConversationId);
        loadMessages(storedConversationId);
      } else {
        // If no conversation ID exists, create a new one
        const newConversationId = uuidv4();
        localStorage.setItem(`conversation_${bookId}`, newConversationId);
        setConversationId(newConversationId);
      }
    };

    loadHistory();
  }, [bookId]);

  // Load messages from database
  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Transform database messages to our Message format
      const formattedMessages: Message[] = data.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at).toISOString(),
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

  const addMessage = (message: Message) => {
    setMessages(prev => [...prev, message]);
  };

  const saveMessagesToDatabase = async (messages: Message[]) => {
    if (!conversationId) return;
    
    try {
      const messagesToSave = messages.map(msg => ({
        conversation_id: conversationId,
        role: msg.role,
        content: msg.content
      }));
      
      await supabase.from('ai_messages').insert(messagesToSave);
    } catch (error) {
      console.error("Error saving messages:", error);
    }
  };

  return {
    messages,
    addMessage,
    saveMessagesToDatabase,
    conversationId
  };
}
