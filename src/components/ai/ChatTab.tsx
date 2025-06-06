
import React, { useState } from 'react';
import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, BookOpenCheck, Send } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '@/types/message';
import { MessageList } from './MessageList';

interface ChatTabProps {
  messages: Message[];
  addMessage: (message: Message) => void;
  saveMessagesToDatabase: (messages: Message[]) => Promise<void>;
  currentBookId: string | null;
  currentPage: number;
  currentPageText: string | null;
  isBookProcessed: boolean | null;
  searchScope: 'page' | 'book';
  toggleSearchScope: () => void;
}

export const ChatTab: React.FC<ChatTabProps> = ({
  messages,
  addMessage,
  saveMessagesToDatabase,
  currentBookId,
  currentPage,
  currentPageText,
  isBookProcessed,
  searchScope,
  toggleSearchScope
}) => {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      
      addMessage(userMessage);
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

      // Log the search scope to verify it's being used correctly
      console.log(`Asking question with search scope: ${searchScope}`);

      // Call the AI assistant function
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          userQuestion: userMessage.content,
          bookId: currentBookId,
          pageNumber: currentPage,
          bookContent: currentPageText,
          mode: 'chat',
          searchScope: searchScope
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

      addMessage(aiResponse);
      
      // Save conversation to database
      await saveMessagesToDatabase([userMessage, aiResponse]);
      
    } catch (error: any) {
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
    <>
      <CardContent className="flex-grow flex flex-col p-4">
        <MessageList 
          messages={messages}
          isBookProcessed={isBookProcessed}
        />
      </CardContent>
      
      <div className="p-4 border-t">
        <div className="flex items-center justify-between mb-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={toggleSearchScope}
                  className="text-xs"
                >
                  {searchScope === 'page' ? (
                    <>
                      <BookOpen className="h-3 w-3 mr-1" />
                      Current Page Only
                    </>
                  ) : (
                    <>
                      <BookOpenCheck className="h-3 w-3 mr-1" />
                      Entire Book Context
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {searchScope === 'page'
                  ? "AI will only use the current page for context"
                  : isBookProcessed === false 
                    ? "Book content may not be fully processed yet, limiting AI's knowledge"
                    : "AI will use the entire book for context"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {isBookProcessed === false && searchScope === 'book' && (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
              Book processing incomplete
            </Badge>
          )}
        </div>

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
    </>
  );
};
