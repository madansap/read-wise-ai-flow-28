
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Send, BookOpen, Bookmark, Highlighter } from "lucide-react";
import { Separator } from "@/components/ui/separator";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const AIAssistantPanel = () => {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your reading assistant. Ask me anything about the book you're reading, and I'll help explain concepts or provide insights.",
    },
  ]);

  const handleSendMessage = () => {
    if (!userInput.trim()) return;

    // Add user message
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userInput,
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setUserInput("");

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: simulateAIResponse(userInput),
      };
      setMessages((prev) => [...prev, aiResponse]);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="p-3 border-b flex items-center">
        <MessageSquare className="h-5 w-5 text-primary mr-2" />
        <h2 className="font-medium">AI Assistant</h2>
      </div>

      <Tabs defaultValue="chat" className="flex-1 flex flex-col">
        <TabsList className="w-full flex justify-between px-4 pt-2 bg-card rounded-none">
          <TabsTrigger value="chat" className="flex-1 data-[state=active]:bg-background">
            <MessageSquare className="h-4 w-4 mr-2" /> 
            Chat
          </TabsTrigger>
          <TabsTrigger value="quiz" className="flex-1 data-[state=active]:bg-background">
            <BookOpen className="h-4 w-4 mr-2" /> 
            Quiz Me
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col p-0 m-0">
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {messages.map((msg) => (
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
            ))}
          </div>

          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Ask about the book..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1"
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!userInput.trim()}
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Chapter 1 Quiz</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2">
                <p className="font-medium text-sm">1. What is the main metaphor James Clear uses to describe habits?</p>
                <div className="space-y-1">
                  <div className="flex items-center">
                    <input type="radio" id="q1a" name="q1" className="mr-2" />
                    <label htmlFor="q1a" className="text-sm">Financial investment</label>
                  </div>
                  <div className="flex items-center">
                    <input type="radio" id="q1b" name="q1" className="mr-2" />
                    <label htmlFor="q1b" className="text-sm">Compound interest</label>
                  </div>
                  <div className="flex items-center">
                    <input type="radio" id="q1c" name="q1" className="mr-2" />
                    <label htmlFor="q1c" className="text-sm">Building blocks</label>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="font-medium text-sm">2. According to the author, why do small habits matter?</p>
                <div className="space-y-1">
                  <div className="flex items-center">
                    <input type="radio" id="q2a" name="q2" className="mr-2" />
                    <label htmlFor="q2a" className="text-sm">They lead to immediate results</label>
                  </div>
                  <div className="flex items-center">
                    <input type="radio" id="q2b" name="q2" className="mr-2" />
                    <label htmlFor="q2b" className="text-sm">They compound over time</label>
                  </div>
                  <div className="flex items-center">
                    <input type="radio" id="q2c" name="q2" className="mr-2" />
                    <label htmlFor="q2c" className="text-sm">They are easier to form than large habits</label>
                  </div>
                </div>
              </div>
              
              <Button className="w-full">Check Answers</Button>
            </CardContent>
          </Card>
          
          <Button variant="outline" className="w-full">
            Generate New Quiz Questions
          </Button>
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
