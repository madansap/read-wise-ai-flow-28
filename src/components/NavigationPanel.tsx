
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Search, UploadCloud, Bookmark, Settings, Highlighter, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import BookUploader from "./BookUploader";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const NavigationPanel = () => {
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [booksOpen, setBooksOpen] = useState(true);
  const [highlightsOpen, setHighlightsOpen] = useState(true);

  return (
    <div className="h-full bg-card flex flex-col">
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search books & notes..."
            className="pl-8 bg-background"
          />
        </div>
      </div>

      <Separator />

      <div className="p-4">
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2"
          onClick={() => setUploaderOpen(true)}
        >
          <UploadCloud className="h-4 w-4" />
          Upload Book
        </Button>
        <BookUploader open={uploaderOpen} onOpenChange={setUploaderOpen} />
      </div>

      <Separator />

      <div className="flex-1 overflow-auto">
        {/* Books Section */}
        <Collapsible open={booksOpen} onOpenChange={setBooksOpen} className="px-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm text-muted-foreground">LIBRARY</h3>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <ChevronRight className={`h-4 w-4 transition-transform ${booksOpen ? "rotate-90" : ""}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="space-y-1 mb-4">
            <Button variant="ghost" className="w-full justify-start gap-2 font-normal">
              <BookOpen className="h-4 w-4" />
              Current Reading
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-2 font-normal">
              <Bookmark className="h-4 w-4" />
              Bookmarks
            </Button>
            {["Atomic Habits", "Deep Work", "The Psychology of Money", "Thinking, Fast and Slow"].map((book) => (
              <Button
                key={book}
                variant="ghost"
                className="w-full justify-start text-left font-normal text-sm pl-10"
              >
                {book}
              </Button>
            ))}
          </CollapsibleContent>
        </Collapsible>

        {/* Highlights Section */}
        <Collapsible open={highlightsOpen} onOpenChange={setHighlightsOpen} className="px-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm text-muted-foreground">HIGHLIGHTS & NOTES</h3>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <ChevronRight className={`h-4 w-4 transition-transform ${highlightsOpen ? "rotate-90" : ""}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="space-y-2">
            {["Chapter 1", "Important Concepts", "To Review", "Ideas"].map((tag) => (
              <Card key={tag} className="border-l-4 border-l-primary">
                <CardContent className="p-3 text-sm">
                  <div className="font-medium mb-1">{tag}</div>
                  <div className="text-muted-foreground text-xs">4 highlights</div>
                </CardContent>
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <Separator />

      <div className="p-4">
        <Button variant="ghost" className="w-full justify-start gap-2">
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </div>
    </div>
  );
};

export default NavigationPanel;
