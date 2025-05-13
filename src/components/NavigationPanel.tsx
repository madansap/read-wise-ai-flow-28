
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Search, UploadCloud, Bookmark, Settings, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import BookUploader from "./BookUploader";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/use-toast";

interface Book {
  id: string;
  title: string;
  author: string | null;
  file_path: string;
}

const NavigationPanel = () => {
  const { user, signOut } = useAuth();
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [booksOpen, setBooksOpen] = useState(true);
  const [highlightsOpen, setHighlightsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch books from database
  const { data: books, isLoading } = useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('id, title, author, file_path')
        .order('created_at', { ascending: false });
      
      if (error) {
        toast({
          title: 'Error loading books',
          description: error.message,
          variant: 'destructive',
        });
        throw new Error(error.message);
      }
      
      return data as Book[];
    },
    enabled: !!user,
  });

  const filteredBooks = books?.filter(book => 
    book.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (book.author && book.author.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="h-full bg-card flex flex-col">
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search books & notes..."
            className="pl-8 bg-background"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
              All Books
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-2 font-normal">
              <Bookmark className="h-4 w-4" />
              Bookmarks
            </Button>

            {isLoading ? (
              <div className="py-4 flex justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : filteredBooks && filteredBooks.length > 0 ? (
              filteredBooks.map((book) => (
                <Button
                  key={book.id}
                  variant="ghost"
                  className="w-full justify-start text-left font-normal text-sm pl-10"
                >
                  {book.title}
                </Button>
              ))
            ) : (
              <div className="py-2 text-center text-sm text-muted-foreground">
                {books && books.length === 0 ? "No books yet" : "No matching books found"}
              </div>
            )}
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
            {/* We'll implement highlights later when we have books */}
            <div className="text-center text-sm text-muted-foreground py-2">
              Highlights will appear here
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <Separator />

      <div className="p-4 flex flex-col gap-2">
        <Button variant="ghost" className="w-full justify-start gap-2">
          <Settings className="h-4 w-4" />
          Settings
        </Button>
        <Button variant="outline" className="w-full justify-start" onClick={() => signOut()}>
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default NavigationPanel;
