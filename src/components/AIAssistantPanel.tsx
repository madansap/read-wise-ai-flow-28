
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Send, RefreshCcw, BookOpen, BookOpenCheck } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { useReading } from '@/contexts/ReadingContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  context_used?: boolean; // Make context_used optional
}

const AIAssistantPanel = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { currentBookId, currentPage, currentPageText } = useReading();
  const [searchScope, setSearchScope] = useState<'page' | 'book'>('book');
  const [activeTab, setActiveTab] = useState('chat');

  // Load conversation history on mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!user || !currentBookId) return;

      // Check for an existing conversation ID in localStorage
      const storedConversationId = localStorage.getItem(`conversation_${currentBookId}`);
      if (storedConversationId) {
        setConversationId(storedConversationId);
        loadMessages(storedConversationId);
      } else {
        // If no conversation ID exists, create a new one
        const newConversationId = uuidv4();
        localStorage.setItem(`conversation_${currentBookId}`, newConversationId);
        setConversationId(newConversationId);
      }
    };

    loadHistory();
  }, [user, currentBookId]);

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
      // Note: database objects don't have context_used field
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

      // Log the search scope to verify it's being used correctly
      console.log(`Asking question with search scope: ${searchScope}`);

      // Call the AI assistant function with the book ID, page number, and user message
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          userQuestion: message,
          bookId: currentBookId,
          pageNumber: currentPage,
          bookContent: currentPageText,
          mode: 'chat',
          searchScope: searchScope // Make sure we're passing the current search scope
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

  // Generate quiz based on current page content
  const handleGenerateQuiz = async () => {
    if (isGeneratingQuiz || !currentBookId) return;

    try {
      setIsGeneratingQuiz(true);
      setActiveTab('quiz');

      // Log the search scope to verify it's being used correctly
      console.log(`Generating quiz with search scope: ${searchScope}`);

      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookId: currentBookId,
          pageNumber: currentPage,
          bookContent: currentPageText,
          mode: 'quiz',
          searchScope: searchScope // Make sure we're passing the current search scope
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

      setMessages(prev => [...prev, quizMessage]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAskQuestion();
  };

  const toggleSearchScope = () => {
    const newScope = searchScope === 'page' ? 'book' : 'page';
    setSearchScope(newScope);
    console.log(`Search scope switched to: ${newScope}`);
    
    // Show toast to confirm search scope change
    toast({
      title: `Context mode: ${newScope === 'page' ? 'Current Page Only' : 'Entire Book'}`,
      description: `AI will now use ${newScope === 'page' ? 'only the current page' : 'the entire book'} for context.`,
    });
  };

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
          <CardContent className="flex-grow flex flex-col p-4">
            <ScrollArea className="flex-grow">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="flex flex-col max-w-[75%]">
                      <div className={`rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                        {msg.content}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center">
                        {msg.role === 'assistant' && msg.context_used !== undefined && (
                          <Badge variant={msg.context_used ? "default" : "outline"} className="mr-2 text-[10px] h-5">
                            {msg.context_used ? 'Using book context' : 'No book context found'}
                          </Badge>
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
            <div className="flex items-center justify-between mb-2">
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
        </TabsContent>

        <TabsContent value="quiz" className="flex-grow flex flex-col p-0 m-0">
          <CardContent className="flex-grow flex flex-col p-4">
            <ScrollArea className="flex-grow">
              <div className="space-y-4">
                {messages.filter(msg => activeTab === 'quiz' && msg.role === 'assistant' && msg.content.includes('Q:')).map((msg) => (
                  <div key={msg.id} className="flex justify-start">
                    <div className="flex flex-col max-w-[90%] w-full">
                      <div className="rounded-lg p-3 text-sm bg-secondary text-secondary-foreground">
                        {msg.content}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center">
                        {msg.context_used !== undefined && (
                          <Badge variant={msg.context_used ? "default" : "outline"} className="mr-2 text-[10px] h-5">
                            {msg.context_used ? 'Using book context' : 'No book context found'}
                          </Badge>
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
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default AIAssistantPanel;
