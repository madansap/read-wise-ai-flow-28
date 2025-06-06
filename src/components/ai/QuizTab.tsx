
import React, { useState } from 'react';
import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '@/types/message';
import { MessageList } from './MessageList';

interface QuizTabProps {
  messages: Message[];
  addMessage: (message: Message) => void;
  saveMessagesToDatabase: (messages: Message[]) => Promise<void>;
  currentBookId: string | null;
  currentPage: number;
  currentPageText: string | null;
  isBookProcessed: boolean | null;
  searchScope: 'page' | 'book';
}

export const QuizTab: React.FC<QuizTabProps> = ({
  messages,
  addMessage,
  saveMessagesToDatabase,
  currentBookId,
  currentPage,
  currentPageText,
  isBookProcessed,
  searchScope
}) => {
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

  // Filter for quiz-related messages
  const quizFilter = (msg: Message) => msg.role === 'assistant' && msg.content.includes('Q:');

  // Generate quiz based on current page content
  const handleGenerateQuiz = async () => {
    if (isGeneratingQuiz || !currentBookId) return;

    try {
      setIsGeneratingQuiz(true);

      // Log the search scope to verify it's being used correctly
      console.log(`Generating quiz with search scope: ${searchScope}`);

      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookId: currentBookId,
          pageNumber: currentPage,
          bookContent: currentPageText,
          mode: 'quiz',
          searchScope: searchScope
        }
      });

      if (response.error) {
        throw new Error(response.error.message || "Error generating quiz");
      }

      // Add quiz to message history
      const quizMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: response.data.quiz || "Sorry, I couldn't generate a quiz",
        timestamp: new Date().toISOString(),
        context_used: response.data.context_used || false
      };

      addMessage(quizMessage);

      // Save to conversation history
      await saveMessagesToDatabase([quizMessage]);

    } catch (error: any) {
      console.error("Error generating quiz:", error);
      toast({
        title: "Quiz Generation Failed",
        description: error.message || "Failed to generate quiz",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  return (
    <>
      <CardContent className="flex-grow flex flex-col p-4">
        <MessageList 
          messages={messages}
          filter={quizFilter}
          isBookProcessed={isBookProcessed}
        />
      </CardContent>
      
      <div className="p-4 border-t">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                onClick={handleGenerateQuiz} 
                disabled={isGeneratingQuiz || !currentBookId} 
                className="w-full"
              >
                {isGeneratingQuiz ? (
                  <>
                    <RefreshCcw className="h-4 w-4 mr-2 animate-spin" />
                    Generating quiz...
                  </>
                ) : (
                  <>Generate Quiz from {searchScope === 'page' ? 'Current Page' : 'Entire Book'}</>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {searchScope === 'page'
                ? "Generate quiz questions based on the current page"
                : isBookProcessed === false 
                  ? "Book content may not be fully processed yet, limiting quiz coverage"
                  : "Generate quiz questions based on the entire book"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </>
  );
};
