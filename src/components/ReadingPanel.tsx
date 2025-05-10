
import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  LayoutDashboard,
  Highlighter,
  MessageSquare
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";

const mockBookContent = `
# Atomic Habits

## Chapter 1: The Surprising Power of Atomic Habits

Habits are the compound interest of self-improvement. Getting 1 percent better every day counts for a lot in the long-run.

Habits are a double-edged sword. They can work for you or against you, which is why understanding the details is essential.

Small changes often appear to make no difference until you cross a critical threshold. The most powerful outcomes of any compounding process are delayed. You need to be patient.

An atomic habit is a little habit that is part of a larger system. Just as atoms are the building blocks of molecules, atomic habits are the building blocks of remarkable results.

If you want better results, then forget about setting goals. Focus on your system instead.

You do not rise to the level of your goals. You fall to the level of your systems.

## Chapter 2: How Your Habits Shape Your Identity (and Vice Versa)

Changing our habits is challenging for two reasons: (1) we try to change the wrong thing and (2) we try to change our habits in the wrong way.

Three layers of behavior change: outcome change, process change, and identity change.

The most effective way to change your habits is to focus not on what you want to achieve, but on who you wish to become.

Your identity emerges out of your habits. Every action is a vote for the type of person you wish to become.

Becoming the best version of yourself requires you to continuously edit your beliefs, and to upgrade and expand your identity.

The real reason habits matter is not because they can get you better results (although they can do that), but because they can change your beliefs about yourself.
`;

const ReadingPanel = () => {
  const [fontSize, setFontSize] = useState(16);
  const [lineHeight, setLineHeight] = useState(1.6);
  const [progress, setProgress] = useState(32);
  const [selectedText, setSelectedText] = useState("");
  const bookContentRef = useRef<HTMLDivElement>(null);
  const [highlights, setHighlights] = useState<Array<{id: string, text: string, note: string}>>([
    {id: "1", text: "Habits are the compound interest of self-improvement.", note: "Key concept to remember"},
    {id: "2", text: "You do not rise to the level of your goals. You fall to the level of your systems.", note: ""},
  ]);

  const increaseFontSize = () => {
    setFontSize((prev) => Math.min(prev + 1, 24));
  };

  const decreaseFontSize = () => {
    setFontSize((prev) => Math.max(prev - 1, 12));
  };

  const increaseLineHeight = () => {
    setLineHeight((prev) => Math.min(prev + 0.1, 2.5));
  };

  const decreaseLineHeight = () => {
    setLineHeight((prev) => Math.max(prev - 0.1, 1));
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      setSelectedText(selection.toString());
    }
  };

  const handleHighlight = () => {
    if (selectedText.trim()) {
      const newHighlight = {
        id: Date.now().toString(),
        text: selectedText,
        note: "",
      };
      setHighlights([...highlights, newHighlight]);
      toast({
        title: "Highlight saved",
        description: "Your highlight has been saved successfully.",
      });
      setSelectedText("");
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-card border-b p-3 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="font-medium">Atomic Habits - James Clear</h2>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={decreaseFontSize}
            className="h-8 w-8"
          >
            <span className="text-sm font-bold">A-</span>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={increaseFontSize} 
            className="h-8 w-8"
          >
            <span className="text-sm font-bold">A+</span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={decreaseLineHeight}
            className="h-8 w-8 flex flex-col items-center justify-center"
            title="Decrease line spacing"
          >
            <div className="flex flex-col">
              <span className="h-[2px] w-4 bg-current mb-[3px]"></span>
              <span className="h-[2px] w-4 bg-current"></span>
            </div>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={increaseLineHeight} 
            className="h-8 w-8 flex flex-col items-center justify-center"
            title="Increase line spacing"
          >
            <div className="flex flex-col">
              <span className="h-[2px] w-4 bg-current mb-[6px]"></span>
              <span className="h-[2px] w-4 bg-current"></span>
            </div>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="reader" className="flex-1 flex flex-col">
        <TabsList className="w-full flex justify-start px-4 pt-2 bg-card border-b rounded-none">
          <TabsTrigger value="reader" className="data-[state=active]:bg-background">
            <BookOpen className="h-4 w-4 mr-2" /> 
            Reader
          </TabsTrigger>
          <TabsTrigger value="highlights" className="data-[state=active]:bg-background">
            <Highlighter className="h-4 w-4 mr-2" /> 
            Highlights
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="data-[state=active]:bg-background">
            <LayoutDashboard className="h-4 w-4 mr-2" /> 
            Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reader" className="flex-1 p-0 m-0 overflow-auto">
          <div className="flex flex-col h-full">
            <div 
              className="flex-1 p-8 max-w-3xl mx-auto w-full" 
              onMouseUp={handleTextSelection}
              ref={bookContentRef}
            >
              <div 
                className="markdown prose prose-slate max-w-none" 
                style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}
                dangerouslySetInnerHTML={{ __html: markdownToHtml(mockBookContent) }} 
              />
            </div>

            {selectedText && (
              <div className="border-t bg-background p-4 flex items-center justify-between shadow-lg">
                <div className="text-sm truncate flex-1 mr-4">
                  <span className="font-medium">Selected:</span> {selectedText}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleHighlight}>
                    <Highlighter className="h-4 w-4 mr-2" />
                    Highlight
                  </Button>
                  <Button size="sm" variant="outline">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Explain
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t bg-muted p-2 flex items-center justify-between">
              <Button variant="ghost" size="sm">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous Chapter
              </Button>
              <div className="text-xs text-muted-foreground">
                {progress}% Complete
              </div>
              <Button variant="ghost" size="sm">
                Next Chapter
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="highlights" className="flex-1 p-6 m-0 overflow-auto">
          <h3 className="text-lg font-medium mb-4">Your Highlights</h3>
          
          <div className="space-y-4">
            {highlights.map((highlight) => (
              <Card key={highlight.id} className="border-l-4 border-l-primary">
                <CardContent className="p-4">
                  <p className="text-sm mb-2">"{highlight.text}"</p>
                  {highlight.note && (
                    <p className="text-xs text-muted-foreground bg-muted p-2 rounded-sm">
                      {highlight.note}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs">
                      Add Note
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs">
                      Generate Summary
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="flex-1 p-6 m-0 overflow-auto">
          <h3 className="text-lg font-medium mb-4">Reading Dashboard</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-medium mb-2">Reading Progress</h4>
                <div className="h-2 bg-muted rounded-full mb-2">
                  <div 
                    className="h-full bg-primary rounded-full" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-muted-foreground">{progress}% Complete</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-medium mb-1">Reading Stats</h4>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Time spent: 1h 23m</p>
                  <p>Highlights: {highlights.length}</p>
                  <p>Pages read: 34/210</p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <h4 className="text-sm font-medium mb-2">Key Concepts</h4>
          <div className="space-y-2 mb-6">
            <Card>
              <CardContent className="p-3">
                <p className="text-sm">Atomic habits are small changes that lead to remarkable results.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-sm">Focus on systems instead of goals for better outcomes.</p>
              </CardContent>
            </Card>
          </div>
          
          <Button size="sm">Generate Chapter Summary</Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Simple markdown to HTML converter (for demonstration)
function markdownToHtml(markdown: string) {
  let html = markdown;
  
  // Convert headings
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  
  // Convert paragraphs
  html = html.replace(/^(?!<h[1-6]|<ul|<ol|<li)(.+)$/gm, '<p>$1</p>');
  
  // Remove extra line breaks
  html = html.replace(/^\s+$/gm, '');
  
  return html;
}

export default ReadingPanel;
