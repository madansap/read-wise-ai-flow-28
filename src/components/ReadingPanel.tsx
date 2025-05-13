
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Sun, Moon, BookOpen } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

// Set up worker source for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const ReadingPanel = () => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [theme, setTheme] = useState<'light' | 'dark' | 'classic'>('light');
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageText, setPageText] = useState<string>('');
  const { user } = useAuth();

  // Load the current book from localStorage or fetch from database
  useEffect(() => {
    const fetchCurrentBook = async () => {
      if (!user) return;

      // Check for a current book in localStorage
      const storedBookId = localStorage.getItem('currentBookId');
      
      if (storedBookId) {
        try {
          const { data, error } = await supabase
            .from('books')
            .select('*')
            .eq('id', storedBookId)
            .eq('user_id', user.id)
            .single();

          if (error) throw error;
          if (data) {
            setSelectedBook(data);
            loadBook(data);
            
            // Restore reading position
            if (data.last_read_position) {
              setCurrentPage(parseInt(data.last_read_position) || 1);
            }
          }
        } catch (error) {
          console.error('Error fetching book:', error);
          localStorage.removeItem('currentBookId');
        }
      }
    };

    fetchCurrentBook();
  }, [user]);

  // Save reading position when changing pages
  useEffect(() => {
    const saveReadingPosition = async () => {
      if (selectedBook && user) {
        try {
          await supabase
            .from('books')
            .update({ last_read_position: currentPage.toString() })
            .eq('id', selectedBook.id)
            .eq('user_id', user.id);
        } catch (error) {
          console.error('Error saving reading position:', error);
        }
      }
    };

    // Debounce saving position
    const timer = setTimeout(() => {
      if (currentPage > 0 && selectedBook) {
        saveReadingPosition();
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [currentPage, selectedBook, user]);

  // Load theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('readingTheme') as 'light' | 'dark' | 'classic';
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  // Save theme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('readingTheme', theme);
  }, [theme]);

  const loadBook = async (book: any) => {
    if (!book || !book.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('books')
        .createSignedUrl(book.file_path, 3600); // 1 hour expiry

      if (error) throw error;
      setPdfUrl(data.signedUrl);
    } catch (error) {
      console.error('Error loading PDF:', error);
      toast({
        title: "Error loading book",
        description: "Could not load the selected book",
        variant: "destructive",
      });
    }
  };

  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const extractTextFromPage = async () => {
    if (!pdfUrl) return;
    
    try {
      const pdf = await pdfjs.getDocument(pdfUrl).promise;
      const page = await pdf.getPage(currentPage);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');
      setPageText(text);
    } catch (error) {
      console.error('Error extracting text:', error);
    }
  };

  // Extract text when page changes
  useEffect(() => {
    if (pdfUrl) {
      extractTextFromPage();
    }
  }, [currentPage, pdfUrl]);

  // Theme class mappings
  const themeClasses = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-gray-100',
    classic: 'bg-[#f8f2e4] text-gray-900 font-serif'
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top controls */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {/* Page navigation */}
          <div className="flex items-center space-x-1">
            <Button 
              variant="outline" 
              size="icon" 
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages || '?'}
            </span>
            <Button 
              variant="outline" 
              size="icon" 
              disabled={totalPages === 0 || currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Theme switch */}
        <div className="flex items-center space-x-1">
          <Button 
            variant={theme === 'light' ? "default" : "outline"} 
            size="icon"
            onClick={() => setTheme('light')}
            title="Light theme"
          >
            <Sun className="h-4 w-4" />
          </Button>
          <Button 
            variant={theme === 'dark' ? "default" : "outline"} 
            size="icon"
            onClick={() => setTheme('dark')}
            title="Dark theme"
          >
            <Moon className="h-4 w-4" />
          </Button>
          <Button 
            variant={theme === 'classic' ? "default" : "outline"} 
            size="icon"
            onClick={() => setTheme('classic')}
            title="Classic theme"
          >
            <BookOpen className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Reading area */}
      <div className={`flex-1 overflow-auto p-4 ${themeClasses[theme]}`}>
        {selectedBook && pdfUrl ? (
          <div id="pdf-container" className="flex justify-center">
            <Document
              file={pdfUrl}
              onLoadSuccess={handleDocumentLoadSuccess}
              loading={
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
                </div>
              }
              error={
                <div className="text-center p-4">
                  <p className="text-red-500">Failed to load PDF. Please try again.</p>
                </div>
              }
            >
              <Page
                pageNumber={currentPage}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className={`border shadow-sm ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
              />
            </Document>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center">
            <Card className="p-8 max-w-md text-center">
              <div className="mx-auto bg-muted rounded-full p-4 w-16 h-16 flex items-center justify-center mb-4">
                <BookOpen className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Book Selected</h2>
              <p className="text-muted-foreground mb-4">
                Select a book from your library to start reading, or upload a new book.
              </p>
              <Button 
                variant="outline"
                className="w-full"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                Upload Book
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReadingPanel;
