import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Send, BookOpen, Zap, Lightbulb, Search, HelpCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from 'uuid';
import { useReading } from "@/contexts/ReadingContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

// Remove PDF.js references since we're using ReadingContext
// PDF text extraction is now handled in ReadingPanel.tsx

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  userAnswer?: number;
  isCorrect?: boolean;
  feedback?: string;
};

const QUICK_PROMPTS = [
  { text: "Explain this page", icon: <Lightbulb className="h-4 w-4 mr-2" /> },
  { text: "Summarize the key points", icon: <Search className="h-4 w-4 mr-2" /> },
  { text: "What does this mean?", icon: <HelpCircle className="h-4 w-4 mr-2" /> },
  { text: "Analyze the author's perspective", icon: <MessageSquare className="h-4 w-4 mr-2" /> },
];

const AIAssistantPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Use the ReadingContext to access page text
  const { 
    currentPageText, 
    isLoadingText, 
    currentBookId,
    currentBookTitle,
    currentPage
  } = useReading();
  
  const [userInput, setUserInput] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "quiz">("chat");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Get or create conversation when book changes
  useEffect(() => {
    const getOrCreateConversation = async () => {
      if (!user || !currentBookId) return;

      try {
        // Check for existing conversation
        const { data: existingConvs, error: fetchError } = await supabase
          .from('ai_conversations')
          .select('id')
          .eq('user_id', user.id)
          .eq('book_id', currentBookId)
          .limit(1);

        if (fetchError) throw fetchError;

        if (existingConvs && existingConvs.length > 0) {
          setCurrentConversationId(existingConvs[0].id);
        } else {
          // Create new conversation
          const { data, error: insertError } = await supabase
            .from('ai_conversations')
            .insert({
              user_id: user.id,
              book_id: currentBookId,
              title: currentBookTitle || 'Reading Session'
            })
            .select('id')
            .single();

          if (insertError) throw insertError;
          
          if (data) {
            setCurrentConversationId(data.id);
          }
        }
      } catch (error) {
        console.error("Error with conversation:", error);
      }
    };

    getOrCreateConversation();
  }, [user, currentBookId, currentBookTitle]);

  // Fetch messages for the current conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['messages', currentConversationId],
    queryFn: async () => {
      if (!currentConversationId) return [];
      
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', currentConversationId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!currentConversationId,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !currentConversationId || !currentPageText) {
        throw new Error("Missing required data");
      }
      
      // First, add the user message to the database
      const userMessageId = uuidv4();
      const { error: userMsgError } = await supabase
        .from('ai_messages')
        .insert({
          id: userMessageId,
          conversation_id: currentConversationId,
          role: 'user',
          content
        });
      
      if (userMsgError) throw userMsgError;
      
      // Call the AI assistant edge function with updated parameters
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookContent: currentPageText,
          userQuestion: content,
          conversationId: currentConversationId,
          user: user,
          mode: "chat"  // Explicitly set mode to "chat"
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message || "Error from AI assistant");
      }
      
      // Return all needed data
      return { 
        userMessage: { id: userMessageId, role: 'user' as const, content },
        aiResponse: response.data.response
      };
    },
    onSuccess: ({ userMessage, aiResponse }) => {
      // Update the messages in the UI immediately
      queryClient.setQueryData(['messages', currentConversationId], 
        (old: Message[] = []) => [...old, 
          userMessage,
          { id: uuidv4(), role: 'assistant', content: aiResponse }
        ]
      );
      
      // Clear the input field
      setUserInput("");
    },
    onError: (error: any) => {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Generate quiz mutation
  const generateQuizMutation = useMutation({
    mutationFn: async () => {
      if (!currentPageText) {
        throw new Error("No book content available");
      }
      
      setIsGeneratingQuiz(true);
      
      // Call AI assistant with quiz mode
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookContent: currentPageText,
          mode: "quiz",
          numQuestions: 3 // Request 3 questions
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message || "Error generating quiz");
      }
      
      // Parse the quiz questions
      try {
        // The AI should return JSON, but it might be embedded in markdown or text
        const responseText = response.data.response;
        
        // Extract JSON from response (might be in a code block)
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                          responseText.match(/```\n([\s\S]*?)\n```/) ||
                          [null, responseText];
        
        const jsonText = jsonMatch[1] || responseText;
        const questions = JSON.parse(jsonText);
        
        return questions as QuizQuestion[];
      } catch (error) {
        console.error("Error parsing quiz questions:", error);
        throw new Error("Failed to parse quiz questions. Try again.");
      }
    },
    onSuccess: (data) => {
      setQuizQuestions(data);
      setCurrentQuestionIndex(0);
      setQuizSubmitted(false);
      setIsGeneratingQuiz(false);
    },
    onError: (error: any) => {
      setIsGeneratingQuiz(false);
      toast({
        title: "Error generating quiz",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Evaluate quiz answer mutation
  const evaluateAnswerMutation = useMutation({
    mutationFn: async ({ questionIndex, optionIndex }: { questionIndex: number, optionIndex: number }) => {
      const question = quizQuestions[questionIndex];
      
      // Call AI assistant with quizEvaluation mode
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookContent: currentPageText,
          mode: "quizEvaluation",
          quizEvaluation: {
            question: question.question,
            options: question.options,
            correctIndex: question.correctIndex,
            userAnswerIndex: optionIndex
          }
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message || "Error evaluating answer");
      }
      
      return {
        feedback: response.data.response,
        isCorrect: optionIndex === question.correctIndex
      };
    },
    onSuccess: (data, variables) => {
      // Update the quiz question with feedback
      setQuizQuestions(prev => {
        const updated = [...prev];
        updated[variables.questionIndex] = {
          ...updated[variables.questionIndex],
          userAnswer: variables.optionIndex,
          isCorrect: data.isCorrect,
          feedback: data.feedback
        };
        return updated;
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error evaluating answer",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleSendMessage = () => {
    if (!userInput.trim()) return;
    
    if (!currentPageText) {
      toast({
        title: "No book content",
        description: "Please wait for the page content to load or select a book.",
        variant: "destructive",
      });
      return;
    }
    
    sendMessageMutation.mutate(userInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleGenerateQuiz = () => {
    if (!currentPageText) {
      toast({
        title: "No book content",
        description: "Please wait for the page content to load or select a book.",
        variant: "destructive",
      });
      return;
    }
    
    generateQuizMutation.mutate();
  };

  const handleAnswerSelect = (questionIndex: number, optionIndex: number) => {
    // Don't allow changing answer after submission
    if (quizQuestions[questionIndex]?.userAnswer !== undefined) return;
    
    evaluateAnswerMutation.mutate({ questionIndex, optionIndex });
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setUserInput(prompt);
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setActiveTab(value as "chat" | "quiz")}
        className="h-full flex flex-col"
      >
        <div className="border-b p-2">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="chat">
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="quiz">
              <Zap className="h-4 w-4 mr-2" />
              Quiz Me
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="chat" className="flex-1 flex flex-col pt-2 overflow-hidden">
          {/* Messages container */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
            {messagesLoading ? (
              <div className="flex justify-center items-center h-20">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-muted-foreground p-4">
                <BookOpen className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
                <h3 className="font-medium mb-1">Ask about your book</h3>
                <p className="text-sm">
                  {isLoadingText 
                    ? "Loading page content..."
                    : currentPageText 
                      ? "Ask any question about the current page." 
                      : "No page content available. Please select a book."}
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          
          {/* Quick prompts */}
          <div className="px-3 grid grid-cols-2 gap-2 my-2">
            {QUICK_PROMPTS.map((prompt, index) => (
              <Button 
                key={index} 
                variant="outline" 
                size="sm"
                className="flex items-center justify-start overflow-hidden"
                onClick={() => handleQuickPrompt(prompt.text)}
                disabled={!currentPageText || isLoadingText || sendMessageMutation.isPending}
              >
                {prompt.icon}
                <span className="truncate">{prompt.text}</span>
              </Button>
            ))}
          </div>
          
          {/* Input area */}
          <div className="px-3 pb-3 pt-1">
            <div className="flex space-x-2">
              <Input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={
                  isLoadingText 
                    ? "Loading page content..." 
                    : currentPageText 
                      ? "Ask about this page..." 
                      : "Select a book to start"
                }
                disabled={!currentPageText || isLoadingText || sendMessageMutation.isPending}
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!userInput.trim() || !currentPageText || isLoadingText || sendMessageMutation.isPending}
              >
                {sendMessageMutation.isPending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {currentPage > 0 && currentBookTitle && (
              <div className="mt-2 text-xs text-muted-foreground">
                Answering based on: {currentBookTitle}, Page {currentPage}
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="quiz" className="flex-1 flex flex-col pt-2 overflow-hidden">
          {!isGeneratingQuiz && quizQuestions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <Card className="w-full max-w-md mx-auto">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Zap className="h-5 w-5 mr-2 text-primary" />
                    Quiz Yourself
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4">
                    {isLoadingText ? 
                      "Loading page content..." : 
                      currentPageText ? 
                        "Generate quiz questions based on the current page to test your understanding." : 
                        "No page content available. Please select a book."}
                  </p>
                  <Button 
                    onClick={handleGenerateQuiz} 
                    className="w-full" 
                    disabled={!currentPageText || isLoadingText}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Generate Quiz
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : isGeneratingQuiz ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
                <p>Generating quiz questions...</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Quiz navigation */}
              <div className="px-4 py-2 text-sm text-center">
                Question {currentQuestionIndex + 1} of {quizQuestions.length}
              </div>
              
              {/* Current question */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {quizQuestions[currentQuestionIndex]?.question}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {quizQuestions[currentQuestionIndex]?.options.map((option, idx) => {
                        const isCorrectAnswer = quizQuestions[currentQuestionIndex]?.correctIndex === idx;
                        const isUserSelection = quizQuestions[currentQuestionIndex]?.userAnswer === idx;
                        const showResult = quizQuestions[currentQuestionIndex]?.userAnswer !== undefined;
                        const isCorrectSelection = isUserSelection && isCorrectAnswer;
                        const isIncorrectSelection = isUserSelection && !isCorrectAnswer;
                        
                        return (
                          <Button 
                            key={idx}
                            variant={isIncorrectSelection ? "destructive" : "outline"}
                            className={`w-full justify-start text-left mb-2 h-auto py-3 ${
                              showResult && isCorrectAnswer ? "border-green-500 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30" : ""
                            }`}
                            onClick={() => handleAnswerSelect(currentQuestionIndex, idx)}
                            disabled={quizQuestions[currentQuestionIndex]?.userAnswer !== undefined}
                          >
                            <span className="mr-2">{String.fromCharCode(65 + idx)}.</span> {option}
                          </Button>
                        );
                      })}
                    </div>
                    
                    {/* Feedback section */}
                    {quizQuestions[currentQuestionIndex]?.feedback && (
                      <div className={`mt-4 p-3 rounded-md border ${quizQuestions[currentQuestionIndex]?.isCorrect ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-900' : 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900'}`}>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {quizQuestions[currentQuestionIndex]?.feedback}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              
              {/* Question navigation */}
              <div className="px-4 pb-4 flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevQuestion}
                  disabled={currentQuestionIndex === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={handleNextQuestion}
                  disabled={currentQuestionIndex === quizQuestions.length - 1}
                >
                  Next
                </Button>
              </div>
              
              {/* Generate new quiz button */}
              <div className="px-4 pb-4">
                <Button 
                  variant="default" 
                  className="w-full"
                  onClick={handleGenerateQuiz}
                  disabled={isGeneratingQuiz}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Generate New Quiz
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AIAssistantPanel;
