
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Send, BookOpen, Zap } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

  // Fetch messages for the current conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['messages', 'current-conversation'],
    queryFn: async () => {
      // In a real app, we'd get the current book ID and conversation ID
      // For now, we'll use a mock conversation
      return [
        {
          id: "1",
          role: "assistant",
          content: "Hello! I'm your reading assistant. Ask me anything about the book you're reading, and I'll help explain concepts or provide insights."
        }
      ] as Message[];
    },
    enabled: !!user,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error("User not authenticated");
      
      // In a real implementation, we would:
      // 1. Save the message to Supabase
      // 2. Send the message to an AI service via Edge Function
      // 3. Save the AI response
      
      // Mock implementation for now
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content,
      };
      
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: simulateAIResponse(content),
      };
      
      return { userMessage, aiResponse };
    },
    onSuccess: ({ userMessage, aiResponse }) => {
      queryClient.setQueryData(['messages', 'current-conversation'], 
        (old: Message[] = []) => [...old, userMessage, aiResponse]
      );
    },
    onError: (error) => {
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
      // In a real implementation, this would call an Edge Function that uses AI
      setIsGeneratingQuiz(true);
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock quiz questions
      const mockQuiz: QuizQuestion[] = [
        {
          question: "What is the main metaphor James Clear uses to describe habits?",
          options: ["Financial investment", "Compound interest", "Building blocks"],
          correctIndex: 1,
        },
        {
          question: "According to the author, why do small habits matter?",
          options: [
            "They lead to immediate results", 
            "They compound over time", 
            "They are easier to form than large habits"
          ],
          correctIndex: 1,
        },
        {
          question: "What does James Clear suggest is more important than goals?",
          options: ["Motivation", "Systems", "Willpower"],
          correctIndex: 1,
        }
      ];
      
      return mockQuiz;
    },
    onSuccess: (data) => {
      setQuizQuestions(data);
      setQuizSubmitted(false);
    },
    onError: (error) => {
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
    if (!userInput.trim()) return;
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
                placeholder="Ask about the book..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1"
                disabled={sendMessageMutation.isPending}
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!userInput.trim() || sendMessageMutation.isPending}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex gap-1 flex-wrap">
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setUserInput("What is an atomic habit?")}>
                What is an atomic habit?
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setUserInput("Explain the concept of systems vs goals")}>
                Systems vs goals
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setUserInput("Summarize this chapter")}>
                Summarize chapter
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="quiz" className="flex-1 p-4 m-0 overflow-auto space-y-4">
          {quizQuestions.length === 0 ? (
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
                  disabled={isGeneratingQuiz}
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

// Simulate AI responses for demonstration
function simulateAIResponse(userInput: string): string {
  const input = userInput.toLowerCase();
  
  if (input.includes("atomic habit")) {
    return "An atomic habit is a small, regular practice or routine that is both easy to do and tiny. James Clear uses this term to describe habits that are part of a larger system. The idea is that small changes, consistently applied, can lead to remarkable results over time.";
  }
  
  if (input.includes("systems") && input.includes("goals")) {
    return "In 'Atomic Habits', James Clear distinguishes between systems and goals. Goals are about the results you want to achieve, while systems are about the processes that lead to those results.\n\nClear argues that focusing on systems is more effective because:\n- Goals are temporary (once achieved, what's next?)\n- Systems are ongoing and build long-term progress\n- Goals restrict happiness until they're achieved, while systems allow satisfaction in the present\n\nHis famous quote is: 'You do not rise to the level of your goals. You fall to the level of your systems.'";
  }
  
  if (input.includes("summarize")) {
    return "Chapter 1 explores the power of tiny changes and how they compound over time. Clear introduces the concept of 'atomic habits' - small improvements that yield massive results when consistently applied. He argues that habits are the compound interest of self-improvement, and getting 1% better every day leads to significant growth over time. The chapter emphasizes focusing on systems rather than goals, as your outcomes are a lagging measure of your habits.";
  }
  
  return "I understand you're asking about \"" + userInput + "\". As this is a demo, I have limited pre-programmed responses. In a real implementation, this would connect to an AI model that could provide detailed answers about any aspect of the book you're reading.";
}

export default AIAssistantPanel;
