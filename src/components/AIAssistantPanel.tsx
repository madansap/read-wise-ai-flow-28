import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Send, BookOpen, Zap, Lightbulb, Search, HelpCircle, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
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

type Book = {
  id: string;
  title: string;
  author: string | null;
  cover_image: string | null;
  is_processed?: boolean;
  processing_status?: string | null;
  file_path?: string;
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
  const [isProcessingBook, setIsProcessingBook] = useState(false);
  const [bookDetails, setBookDetails] = useState<Book | null>(null);

  // Add ref for messages container
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Get book details and processing status
  useEffect(() => {
    const fetchBookDetails = async () => {
      if (!currentBookId) return;
      
      try {
        const { data, error } = await supabase
          .from('books')
          .select('*')
          .eq('id', currentBookId)
          .single();
          
        if (error) throw error;
        setBookDetails(data);
      } catch (error) {
        console.error("Error fetching book details:", error);
      }
    };
    
    fetchBookDetails();
    
    // Poll for updates if the book is being processed
    let intervalId: number | null = null;
    
    if (currentBookId && bookDetails && bookDetails.processing_status?.includes('Processing')) {
      intervalId = window.setInterval(fetchBookDetails, 5000); // Check every 5 seconds
    }
    
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [currentBookId, bookDetails?.processing_status]);

  // Handle manual book processing
  const processBook = async () => {
    if (!currentBookId || !user || !bookDetails?.file_path) {
      toast({
        title: "Missing required information",
        description: "Can't process the book at this time",
        variant: "destructive",
      });
      return;
    }
    
    setIsProcessingBook(true);
    
    try {
      // Update status to indicate processing is starting
      await supabase
        .from('books')
        .update({ 
          is_processed: false,
          processing_status: 'Queued for processing' 
        })
        .eq('id', currentBookId);
      
      // Trigger processing function with the endpoint parameter
      const { error: processingError } = await supabase.functions.invoke('ai-assistant', {
        body: {
          endpoint: 'extract-pdf-text',
          book_id: currentBookId,
          user_id: user.id,
          file_path: bookDetails.file_path
        }
      });
      
      if (processingError) {
        throw processingError;
      }
      
      toast({
        title: "Processing Started",
        description: "Book processing has been initiated. This may take a few minutes.",
      });
      
      // Refresh book details to show updated status
      const { data } = await supabase
        .from('books')
        .select('*')
        .eq('id', currentBookId)
        .single();
        
      setBookDetails(data);
      
    } catch (error) {
      console.error('Error processing book:', error);
      toast({
        title: "Processing Failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessingBook(false);
    }
  };

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !currentConversationId || !currentPageText || isLoadingText) {
        throw new Error("Missing required data or page is still loading");
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
      
      // Call the AI assistant edge function with updated parameters including book_id and page context
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookContent: currentPageText,
          userQuestion: content,
          conversationId: currentConversationId,
          user: user,
          mode: "chat",
          bookId: currentBookId,
          pageNumber: currentPage // Always send current page for context
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message || "Error from AI assistant");
      }
      
      // Return all needed data
      return { 
        userMessage: { id: userMessageId, role: 'user' as const, content },
        aiResponse: response.data.response,
        contextUsed: response.data.context_used
      };
    },
    onSuccess: ({ userMessage, aiResponse, contextUsed }) => {
      // Update the messages in the UI immediately
      queryClient.setQueryData(['messages', currentConversationId], 
        (old: Message[] = []) => [...old, 
          userMessage,
          { id: uuidv4(), role: 'assistant', content: aiResponse }
        ]
      );
      
      // Optionally show toast when RAG was used
      if (contextUsed) {
        toast({
          title: "Enhanced Context Used",
          description: "AI used broader book context to improve the answer.",
          variant: "default",
        });
      }
      
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
      if (!currentPageText || isLoadingText) {
        throw new Error("No book content available or page is still loading");
      }
      
      setIsGeneratingQuiz(true);
      
      // Call AI assistant with quiz mode, explicitly including page number
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookContent: currentPageText,
          mode: "quiz",
          numQuestions: 3,
          bookId: currentBookId,
          pageNumber: currentPage // Always send current page for context
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
          },
          bookId: currentBookId, // Send book ID for additional context
          pageNumber: currentPage // Send current page for context
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
    if (!currentPageText || isLoadingText) {
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
    // Check if we can send
    if (!currentPageText || isLoadingText || sendMessageMutation.isPending) {
      return;
    }
    
    // Set the prompt and immediately send it rather than just updating the input field
    setUserInput(prompt);
    sendMessageMutation.mutate(prompt);
  };

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendMessageMutation.isPending]);

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
        
        {/* Show book processing status or prompt */}
        {!bookDetails?.is_processed && (
          <div className="mx-4 mt-3 mb-0 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
              <div className="flex-grow">
                <h4 className="font-semibold text-sm mb-1">Book needs processing</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  {bookDetails?.processing_status?.includes('Processing') 
                    ? `Processing in progress: ${bookDetails.processing_status}`
                    : "This book needs to be processed for AI chat and quiz features to work properly."}
                </p>
                {!bookDetails?.processing_status?.includes('Processing') && (
                  <Button 
                    size="sm" 
                    onClick={processBook}
                    disabled={isProcessingBook}
                    className="bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    {isProcessingBook ? "Processing..." : "Process Book Now"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
        
        <TabsContent value="chat" className="flex-1 flex flex-col h-full">
          {/* Messages area - flex-grow to fill available space */}
          <div className="flex-grow overflow-y-auto px-3 pt-4 pb-2">
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
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] md:max-w-[80%] rounded-lg px-4 py-2 ${
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
                ))}

                {sendMessageMutation.isPending && (
                  <div className="flex justify-start mt-4">
                    <div className="max-w-[85%] md:max-w-[80%] rounded-lg px-4 py-3 bg-muted">
                      <div className="flex items-center space-x-2">
                        <div className="animate-pulse flex space-x-1">
                          <div className="h-2 w-2 bg-muted-foreground/60 rounded-full"></div>
                          <div className="h-2 w-2 bg-muted-foreground/60 rounded-full animation-delay-200"></div>
                          <div className="h-2 w-2 bg-muted-foreground/60 rounded-full animation-delay-400"></div>
                        </div>
                        <span className="text-sm text-muted-foreground">AI is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Invisible element to scroll to */}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          
          {/* Input area - flex-shrink-0 to maintain height and not compress */}
          <div className="flex-shrink-0 border-t bg-background">
            {/* Quick prompts */}
            <div className="px-3 grid grid-cols-2 gap-2 mt-2 mb-2">
              {QUICK_PROMPTS.map((prompt, index) => (
                <Button 
                  key={index} 
                  variant="outline" 
                  size="sm"
                  className="flex items-center justify-start overflow-hidden text-xs"
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
                        ? `Ask about page ${currentPage}...` 
                        : "Select a book to start"
                  }
                  disabled={!currentPageText || isLoadingText || sendMessageMutation.isPending}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSendMessage} 
                  disabled={!userInput.trim() || !currentPageText || isLoadingText || sendMessageMutation.isPending}
                  aria-label="Send message"
                >
                  {sendMessageMutation.isPending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {currentPage > 0 && currentBookTitle && (
                <div className="mt-2 flex items-center">
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Page {currentPage}
                  </span>
                  <span className="mx-1 text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground truncate">{currentBookTitle}</span>
                  {currentBookId && !isLoadingText && (
                    <>
                      <span className="mx-1 text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-primary truncate">AI has book context</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="quiz" className="flex-1 flex flex-col overflow-hidden">
          {!isGeneratingQuiz && quizQuestions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <Card className="w-full max-w-md mx-auto">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Zap className="h-5 w-5 mr-2 text-primary" />
                    Quiz on Page {currentPage}
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
                    className="w-full relative"
                    disabled={!currentPageText || isLoadingText}
                  >
                    {isGeneratingQuiz ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent mr-2" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Generate Quiz
                      </>
                    )}
                  </Button>
                  {currentPage > 0 && currentBookTitle && (
                    <div className="mt-4 text-xs flex items-center justify-center">
                      <span className="font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        Page {currentPage}
                      </span>
                      <span className="mx-1 text-muted-foreground">•</span>
                      <span className="text-muted-foreground truncate">{currentBookTitle}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : isGeneratingQuiz ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
                <p>Generating quiz questions...</p>
                <p className="text-sm text-muted-foreground mt-2">This may take a few moments</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Quiz navigation and progress */}
              <div className="px-4 py-3 border-b">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <h3 className="font-medium">
                      Question {currentQuestionIndex + 1} of {quizQuestions.length}
                    </h3>
                    <span className="ml-2 text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      Page {currentPage}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {quizQuestions.filter(q => q.userAnswer !== undefined).length} of {quizQuestions.length} answered
                  </div>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300 ease-in-out" 
                    style={{ width: `${(currentQuestionIndex / (quizQuestions.length - 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
              
              {/* Current question */}
              <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
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
                            <div className="flex items-center">
                              <div className={`flex-shrink-0 mr-3 w-6 h-6 rounded-full flex items-center justify-center ${
                                showResult && isCorrectAnswer 
                                  ? "bg-green-100 text-green-700 border border-green-500 dark:bg-green-900/40 dark:text-green-300" 
                                  : isIncorrectSelection 
                                    ? "bg-red-100 text-red-700 border border-red-500 dark:bg-red-900/40 dark:text-red-300"
                                    : "border border-muted-foreground/30"
                              }`}>
                                {String.fromCharCode(65 + idx)}
                              </div>
                              <span>{option}</span>
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                    
                    {/* Feedback section with improved styling */}
                    {quizQuestions[currentQuestionIndex]?.feedback && (
                      <div 
                        className={`mt-4 p-4 rounded-md border ${
                          quizQuestions[currentQuestionIndex]?.isCorrect 
                            ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-900' 
                            : 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900'
                        }`}
                      >
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
              
              {/* Question navigation and actions */}
              <div className="px-4 py-3 border-t bg-background">
                <div className="flex justify-between mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevQuestion}
                    disabled={currentQuestionIndex === 0}
                    className="w-24"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextQuestion}
                    disabled={currentQuestionIndex === quizQuestions.length - 1}
                    className="w-24"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>

                {/* Generate new quiz button */}
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
