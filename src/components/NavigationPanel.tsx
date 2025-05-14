import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Plus, Book, LogOut, AlertCircle, CheckCircle2, Loader2, MoreVertical, Zap } from 'lucide-react';
import BookUploader from './BookUploader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Book = {
  id: string;
  title: string;
  author: string | null;
  cover_image: string | null;
  is_processed?: boolean;
  processing_status?: string | null;
};

const NavigationPanel = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const { user, signOut } = useAuth();
  const [isProcessingBook, setIsProcessingBook] = useState(false);
  const [bookDetails, setBookDetails] = useState<Book | null>(null);

  // Declare fetchBooks outside of useEffect
  const fetchBooks = useCallback(async () => {
      if (!user) return;
      
      try {
        setLoading(true);
      // First, try to get books with minimal fields we know exist
        const { data, error } = await supabase
          .from('books')
          .select('id, title, author, cover_image')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
      // Map the returned data to our Book type, adding processing fields if they exist
      const mappedBooks = (data || []).map(book => {
        return {
          id: book.id,
          title: book.title,
          author: book.author,
          cover_image: book.cover_image,
          // Cast to any to access potential fields that might not be in the type definition
          is_processed: (book as any).is_processed,
          processing_status: (book as any).processing_status
        } as Book;
      });
      
      setBooks(mappedBooks);
        
        // Check for currently selected book
        const currentBookId = localStorage.getItem('currentBookId');
        if (currentBookId) {
          setSelectedBookId(currentBookId);
      } else if (mappedBooks.length > 0) {
          // Select the first book if none is selected
        setSelectedBookId(mappedBooks[0].id);
        localStorage.setItem('currentBookId', mappedBooks[0].id);
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
  }, [user]);

  // Use the fetchBooks function in useEffect
  useEffect(() => {
    fetchBooks();
    
    // Set up real-time subscription to book updates for processing status
    const subscription = supabase
      .channel('book-processing-updates')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public',
        table: 'books',
        filter: user ? `user_id=eq.${user.id}` : undefined
      }, (payload) => {
        // Safe type handling for payload
        if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
          const updatedBook = {
            id: payload.new.id as string,
            title: payload.new.title as string,
            author: payload.new.author as string | null,
            cover_image: payload.new.cover_image as string | null,
            is_processed: payload.new.is_processed as boolean | undefined,
            processing_status: payload.new.processing_status as string | null | undefined
          };
          
          // Update the book in the local state
          setBooks(current => current.map(book => 
            book.id === updatedBook.id ? { ...book, ...updatedBook } : book
          ));
          
          // If processing is complete for a book, show a toast
          if (updatedBook.is_processed && 
              updatedBook.processing_status === 'Complete' && 
              payload.old && 
              typeof payload.old === 'object' && 
              'is_processed' in payload.old && 
              !payload.old.is_processed) {
            toast({
              title: "Book Processing Complete",
              description: `${updatedBook.title} is now ready with AI-enhanced capabilities!`,
            });
          }
        }
      })
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, [fetchBooks]);

  const handleBookUploadSuccess = () => {
    // Close the dialog
    setDialogOpen(false);
    
    // Refresh the book list
    fetchBooks();
  };

  const selectBook = (bookId: string) => {
    setSelectedBookId(bookId);
    localStorage.setItem('currentBookId', bookId);
    
    // Force reload to update the PDF viewer
    window.location.reload();
  };

  // Function to render processing status indicator
  const renderProcessingStatus = (book: Book) => {
    if (book.is_processed === undefined || book.is_processed === null) {
      return null;
    }
    
    if (book.is_processed) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Book is processed with AI capabilities</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    if (book.processing_status?.includes('Error')) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p>{book.processing_status}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    if (book.processing_status?.includes('Processing')) {
      // Extract progress percentage if available
      const progressMatch = book.processing_status.match(/Processing (\d+) of (\d+)/);
      const progressValue = progressMatch ? 
        (parseInt(progressMatch[1]) / parseInt(progressMatch[2])) * 100 : 
        null;
      
      return (
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          <div className="flex flex-col space-y-1 flex-1 min-w-[100px]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Progress 
                    value={progressValue || 50} 
                    className="h-1 w-full" 
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{book.processing_status}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      );
    }
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Processing status: {book.processing_status || 'Pending'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Add a new function to manually process a book
  const processBook = async (bookId: string) => {
    try {
      setIsProcessingBook(true);
      
      // Get book details
      const { data: book, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();
      
      if (bookError) throw bookError;
      
      // Update status to indicate processing is starting
      await supabase
        .from('books')
        .update({ 
          is_processed: false,
          processing_status: 'Queued for processing' 
        })
        .eq('id', bookId);
      
      // Add improved retry logic for more reliable processing
      let retryCount = 0;
      const maxRetries = 3;
      let processingError;
      
      while (retryCount <= maxRetries) {
        try {
          console.log(`Attempting to process book (attempt ${retryCount + 1}/${maxRetries + 1})`);
          
          // Small delay to ensure DB consistency
          if (retryCount === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // Trigger processing function with the endpoint parameter
          const response = await supabase.functions.invoke('ai-assistant', {
            body: {
              book_id: bookId,
              user_id: user?.id,
              file_path: book.file_path,
              endpoint: 'extract-pdf-text' // Include endpoint in body for extraction
            }
          });
          
          if (response.error) {
            throw new Error(response.error.message || "Function invocation failed");
          }
          
          // Check for success field in the response data
          if (!response.data || response.data.success === false) {
            const errorMessage = response.data?.message || response.data?.error || "Unknown processing error";
            console.error('Processing error from Edge Function:', errorMessage);
            throw new Error(errorMessage);
          }
          
          console.log('Processing initiated successfully:', response.data);
          processingError = null;
          break; // Success, exit retry loop
        } catch (error: any) {
          processingError = error;
          console.error(`Error triggering PDF processing (attempt ${retryCount + 1}):`, error);
          
          // Check for specific error that might indicate a PDF parsing issue
          if (error.message && (
            error.message.includes("PDF parsing failed") || 
            error.message.includes("PDF processing failed"))
          ) {
            console.error("PDF parsing error detected, may need different approach:", error);
            retryCount += 2; // Skip ahead in retries since this is likely a content issue
          } else {
            retryCount++;
          }
          
          if (retryCount <= maxRetries) {
            // Wait before retrying with exponential backoff (2s, 4s, 8s)
            const backoffDelay = 2000 * Math.pow(2, retryCount - 1);
            console.log(`Waiting ${backoffDelay}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }
        }
      }
      
      if (processingError) {
        // Try to get more detailed error from the book status
        const { data: updatedBook } = await supabase
          .from('books')
          .select('processing_status')
          .eq('id', bookId)
          .single();
        
        let errorMessage = processingError.message || "Unknown error";
        if (updatedBook?.processing_status?.includes("Error:")) {
          errorMessage = updatedBook.processing_status;
        }
        
        throw new Error(errorMessage);
      }
      
      toast({
        title: "Processing Started",
        description: "Book processing has been initiated. This may take a few minutes.",
      });
      
      // Refresh book details to show updated status
      const { data } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();
        
      setBookDetails(data);
      
    } catch (error: any) {
      console.error('Error processing book:', error);
      
      // Make sure the book status is updated even if there's an error
      try {
        await supabase
          .from('books')
          .update({ 
            is_processed: false,
            processing_status: `Error: ${error.message || "Unknown error"}` 
          })
          .eq('id', bookId);
      } catch (statusError) {
        console.error('Failed to update book status:', statusError);
      }
      
      toast({
        title: "Processing Failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessingBook(false);
    }
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
              <div key={book.id} className="flex items-center">
              <Button
                variant={selectedBookId === book.id ? "secondary" : "ghost"}
                className="w-full justify-start font-normal h-auto py-2 px-3"
                onClick={() => selectBook(book.id)}
              >
                  <div className="flex items-center justify-between w-full">
                <div className="truncate text-left">
                  <p className="truncate">{book.title}</p>
                  {book.author && (
                    <p className="text-xs text-muted-foreground truncate">
                      {book.author}
                    </p>
                  )}
                </div>
                    
                    <div className="ml-2 flex-shrink-0">
                      {renderProcessingStatus(book)}
                    </div>
                  </div>
                </Button>
                
                {/* Add context menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
              </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(book.is_processed === false || !book.is_processed) && (
                      <DropdownMenuItem onClick={() => processBook(book.id)}>
                        <Zap className="mr-2 h-4 w-4" />
                        Process Book Content
                      </DropdownMenuItem>
                    )}
                    {/* Add additional menu items here */}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
