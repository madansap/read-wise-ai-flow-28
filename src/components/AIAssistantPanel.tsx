
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Send, BookOpen, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from 'uuid';
import { pdfjs } from 'react-pdf';

// Configure worker for PDF.js if not already configured
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
}

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
};

const AIAssistantPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [userInput, setUserInput] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "quiz">("chat");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [pageText, setPageText] = useState<string>("");

  // Get current book and page text
  useEffect(() => {
    const bookId = localStorage.getItem('currentBookId');
    if (bookId) {
      setCurrentBookId(bookId);
    }

    // Create or get conversation ID
    const getOrCreateConversation = async () => {
      if (!user || !bookId) return;

      try {
        // Check for existing conversation
        const { data: existingConvs, error: fetchError } = await supabase
          .from('ai_conversations')
          .select('id')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
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
              book_id: bookId,
              title: 'Reading Session'
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
  }, [user]);

  // Extract text from current PDF page
  useEffect(() => {
    const extractPageText = async () => {
      if (!currentBookId) return;
      
      try {
        // Get book data
        const { data: bookData, error: bookError } = await supabase
          .from('books')
          .select('file_path, last_read_position')
          .eq('id', currentBookId)
          .single();
          
        if (bookError) throw bookError;
        
        // Get signed URL for the PDF
        const { data: urlData, error: urlError } = await supabase
          .storage
          .from('books')
          .createSignedUrl(bookData.file_path, 3600);
          
        if (urlError) throw urlError;
        
        const currentPage = parseInt(bookData.last_read_position) || 1;
        
        // Load PDF and extract text
        const pdf = await pdfjs.getDocument(urlData.signedUrl).promise;
        const page = await pdf.getPage(currentPage);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(' ');
        
        setPageText(text);
      } catch (error) {
        console.error("Error extracting page text:", error);
      }
    };
    
    extractPageText();
  }, [currentBookId]);

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
      if (!user || !currentConversationId || !pageText) {
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
      
      // Call the AI assistant edge function
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookContent: pageText,
          userQuestion: content,
          conversationId: currentConversationId,
          user: user
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
      if (!pageText) {
        throw new Error("No book content available");
      }
      
      setIsGeneratingQuiz(true);
      
      // Call OpenAI via edge function to generate questions
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookContent: pageText,
          userQuestion: "Generate 3 multiple-choice quiz questions about this content. Each question should have 4 options. Format your response as a JSON array with objects containing 'question', 'options' (array of 4 strings), and 'correctIndex' (0-3). Make it challenging but fair.",
          conversationId: null
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
        throw new Error("Failed to parse quiz questions");
      }
    },
    onSuccess: (data) => {
      setQuizQuestions(data);
      setQuizSubmitted(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error generating quiz",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsGeneratingQuiz(false);
    }
  });

  const handleSendMessage = () => {
    if (!userInput.trim() || !pageText) return;
    sendMessageMutation.mutate(userInput);
    setUserInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleGenerateQuiz = () => {
    generateQuizMutation.mutate();
  };

  const handleAnswerSelect = (questionIndex: number, optionIndex: number) => {
    if (quizSubmitted) return;
    
    setQuizQuestions(prev => 
      prev.map((q, i) => i === questionIndex ? {...q, userAnswer: optionIndex} : q)
    );
  };

  const handleSubmitQuiz = () => {
    const allQuestionsAnswered = quizQuestions.every(q => typeof q.userAnswer !== 'undefined');
    
    if (!allQuestionsAnswered) {
      toast({
        title: "Please answer all questions",
        description: "Make sure to select an answer for each question before submitting.",
        variant: "destructive",
      });
      return;
    }
    
    const markedQuiz = quizQuestions.map(q => ({
      ...q,
      isCorrect: q.userAnswer === q.correctIndex
    }));
    
    setQuizQuestions(markedQuiz);
    setQuizSubmitted(true);
    
    const correctAnswers = markedQuiz.filter(q => q.isCorrect).length;
    const score = Math.round((correctAnswers / markedQuiz.length) * 100);
    
    toast({
      title: `Quiz Score: ${score}%`,
      description: `You got ${correctAnswers} out of ${markedQuiz.length} questions correct.`,
      variant: score >= 70 ? "default" : "destructive",
    });
  };

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="p-3 border-b flex items-center">
        <MessageSquare className="h-5 w-5 text-primary mr-2" />
        <h2 className="font-medium">AI Assistant</h2>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setActiveTab(value as "chat" | "quiz")} 
        className="flex-1 flex flex-col"
      >
        <TabsList className="w-full flex justify-between px-4 pt-2 bg-card rounded-none">
          <TabsTrigger value="chat" className="flex-1 data-[state=active]:bg-background">
            <MessageSquare className="h-4 w-4 mr-2" /> 
            Chat
          </TabsTrigger>
          <TabsTrigger value="quiz" className="flex-1 data-[state=active]:bg-background">
            <Zap className="h-4 w-4 mr-2" /> 
            Quiz Me
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col p-0 m-0">
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {messagesLoading ? (
              <div className="flex justify-center p-4">
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-6">
                <div className="mx-auto bg-muted rounded-full p-3 w-12 h-12 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-3 font-medium">AI Reading Assistant</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-xs mx-auto">
                  Ask questions about what you're reading, get explanations, or request summaries.
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
                    className={`max-w-[85%] rounded-lg p-3 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder={currentBookId ? "Ask about the book..." : "Select a book to ask questions"}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1"
                disabled={sendMessageMutation.isPending || !currentBookId}
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!userInput.trim() || sendMessageMutation.isPending || !currentBookId || !pageText}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex gap-1 flex-wrap">
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setUserInput("Explain this page")}>
                Explain this page
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setUserInput("Summarize key points")}>
                Key points
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setUserInput("Clarify difficult concepts")}>
                Clarify concepts
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="quiz" className="flex-1 p-4 m-0 overflow-auto space-y-4">
          {!currentBookId ? (
            <Card>
              <CardContent className="pt-6 text-center space-y-4">
                <div className="mx-auto bg-muted rounded-full p-3 w-12 h-12 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="font-medium text-lg mb-2">Select a Book</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Please select a book from your library before generating quiz questions.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : quizQuestions.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center space-y-4">
                <div className="mx-auto bg-muted rounded-full p-3 w-12 h-12 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-medium text-lg mb-2">Test Your Understanding</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate quiz questions based on the current chapter to test your understanding.
                  </p>
                </div>
                <Button 
                  onClick={handleGenerateQuiz} 
                  disabled={isGeneratingQuiz || !pageText}
                  className="w-full"
                >
                  {isGeneratingQuiz ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-current mr-2"></div>
                      Generating Quiz...
                    </>
                  ) : (
                    "Generate Quiz Questions"
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {quizQuestions.map((question, qIndex) => (
                  <Card key={qIndex}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex">
                        <span className="bg-muted rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">
                          {qIndex + 1}
                        </span>
                        {question.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-1">
                        {question.options.map((option, oIndex) => {
                          const isSelected = question.userAnswer === oIndex;
                          const showResult = quizSubmitted;
                          const isCorrect = oIndex === question.correctIndex;
                          
                          let buttonClass = "justify-start border w-full text-left font-normal";
                          
                          if (showResult) {
                            if (isCorrect) {
                              buttonClass += " bg-green-500/10 border-green-500 text-green-600";
                            } else if (isSelected && !isCorrect) {
                              buttonClass += " bg-red-500/10 border-red-500 text-red-600";
                            }
                          } else if (isSelected) {
                            buttonClass += " border-primary";
                          }
                          
                          return (
                            <Button
                              key={oIndex}
                              variant="outline"
                              className={buttonClass}
                              onClick={() => handleAnswerSelect(qIndex, oIndex)}
                              disabled={quizSubmitted}
                            >
                              <div className="mr-2 rounded-full w-6 h-6 border flex items-center justify-center text-xs">
                                {String.fromCharCode(65 + oIndex)}
                              </div>
                              {option}
                            </Button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex gap-2">
                {quizSubmitted ? (
                  <Button 
                    className="w-full" 
                    onClick={handleGenerateQuiz}
                    disabled={isGeneratingQuiz}
                  >
                    Generate New Quiz
                  </Button>
                ) : (
                  <Button 
                    className="w-full" 
                    onClick={handleSubmitQuiz}
                  >
                    Submit Answers
                  </Button>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AIAssistantPanel;
