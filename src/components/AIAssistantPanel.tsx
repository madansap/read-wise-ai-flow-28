
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useReading } from '@/contexts/ReadingContext';
import { useMessages } from '@/hooks/useMessages';
import { ChatTab } from './ai/ChatTab';
import { QuizTab } from './ai/QuizTab';

const variantOptions = {
  success: "default",
  error: "destructive",
  info: "default", 
  warning: "default" // Add warning variant mapping to a valid type
} as const;

const AIAssistantPanel = () => {
  const { user } = useAuth();
  const { currentBookId, currentPage, currentPageText } = useReading();
  const [activeTab, setActiveTab] = useState('chat');
  const [isBookProcessed, setIsBookProcessed] = useState<boolean | null>(null);
  const [searchScope, setSearchScope] = useState<'page' | 'book'>('book');
  
  const { messages, addMessage, saveMessagesToDatabase } = useMessages(currentBookId);

  // Check if the current book is processed
  useEffect(() => {
    const checkBookProcessingStatus = async () => {
      if (!currentBookId) {
        setIsBookProcessed(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('books')
          .select('is_processed, processing_status')
          .eq('id', currentBookId)
          .single();

        if (error) throw error;

        setIsBookProcessed(data.is_processed || false);
        
        // If the book isn't processed, show a warning toast
        if (!data.is_processed) {
          toast({
            title: "Book not fully processed",
            description: "AI may have limited knowledge of the book content. Processing status: " + 
                        (data.processing_status || "Not processed"),
            variant: "default", // Changed from "warning" to "default"
          });
        }
      } catch (error) {
        console.error("Error checking book processing status:", error);
        setIsBookProcessed(null);
      }
    };

    checkBookProcessingStatus();
  }, [currentBookId]);

  return (
    <Card className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b p-2">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="quiz">Quiz Me</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="flex-grow flex flex-col p-0 m-0">
          <ChatTab 
            messages={messages}
            addMessage={addMessage}
            saveMessagesToDatabase={saveMessagesToDatabase}
            currentBookId={currentBookId}
            currentPage={currentPage}
            currentPageText={currentPageText}
            isBookProcessed={isBookProcessed}
          />
        </TabsContent>

        <TabsContent value="quiz" className="flex-grow flex flex-col p-0 m-0">
          <QuizTab 
            messages={messages}
            addMessage={addMessage}
            saveMessagesToDatabase={saveMessagesToDatabase}
            currentBookId={currentBookId}
            currentPage={currentPage}
            currentPageText={currentPageText}
            isBookProcessed={isBookProcessed}
            searchScope={searchScope}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default AIAssistantPanel;
