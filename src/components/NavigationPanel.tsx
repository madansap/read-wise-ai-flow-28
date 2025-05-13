
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Plus, Book, LogOut } from 'lucide-react';
import BookUploader from './BookUploader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

type Book = {
  id: string;
  title: string;
  author: string | null;
  cover_image: string | null;
};

const NavigationPanel = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const { user, signOut } = useAuth();

  // Fetch user's books
  useEffect(() => {
    const fetchBooks = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('books')
          .select('id, title, author, cover_image')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        setBooks(data || []);
        
        // Check for currently selected book
        const currentBookId = localStorage.getItem('currentBookId');
        if (currentBookId) {
          setSelectedBookId(currentBookId);
        } else if (data && data.length > 0) {
          // Select the first book if none is selected
          setSelectedBookId(data[0].id);
          localStorage.setItem('currentBookId', data[0].id);
        }
      } catch (error: any) {
        toast({
          title: "Error fetching books",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, [user]);

  const handleBookUploadSuccess = () => {
    // Close the dialog
    setDialogOpen(false);
    
    // Refresh the book list
    if (user) {
      supabase
        .from('books')
        .select('id, title, author, cover_image')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            toast({
              title: "Error refreshing books",
              description: error.message,
              variant: "destructive",
            });
          } else {
            setBooks(data || []);
          }
        });
    }
  };

  const selectBook = (bookId: string) => {
    setSelectedBookId(bookId);
    localStorage.setItem('currentBookId', bookId);
    
    // Force reload to update the PDF viewer
    window.location.reload();
  };

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="p-4 flex items-center justify-between border-b">
        <h2 className="font-semibold">My Library</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost">
              <Plus className="h-4 w-4 mr-2" />
              Add Book
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload a new book</DialogTitle>
            </DialogHeader>
            <BookUploader onUploadSuccess={handleBookUploadSuccess} />
          </DialogContent>
        </Dialog>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Book className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>Your library is empty</p>
            <p className="text-sm">Upload your first book to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {books.map((book) => (
              <Button
                key={book.id}
                variant={selectedBookId === book.id ? "secondary" : "ghost"}
                className="w-full justify-start font-normal h-auto py-2 px-3"
                onClick={() => selectBook(book.id)}
              >
                <div className="truncate text-left">
                  <p className="truncate">{book.title}</p>
                  {book.author && (
                    <p className="text-xs text-muted-foreground truncate">
                      {book.author}
                    </p>
                  )}
                </div>
              </Button>
            ))}
          </div>
        )}
      </ScrollArea>
      
      <div className="p-4 border-t mt-auto">
        <Button 
          variant="outline" 
          className="w-full"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default NavigationPanel;
