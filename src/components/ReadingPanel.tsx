import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Sun, Moon, BookOpen } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useReading } from '@/contexts/ReadingContext';
import { useSelection } from '@/contexts/SelectionContext';
import SelectionToolbar from './SelectionToolbar';

// Set up worker source for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const ReadingPanel = () => {
  // Use the ReadingContext
  const { 
    currentPage, setCurrentPage,
    totalPages, setTotalPages,
    currentPageText, setCurrentPageText,
    isLoadingText, setIsLoadingText,
    currentBookId, setCurrentBookId,
    currentBookTitle, setCurrentBookTitle
  } = useReading();

  // Use the SelectionContext
  const { 
    handleTextSelection, 
    clearSelection,
    setPageNumber
  } = useSelection();
  
  const [theme, setTheme] = useState<'light' | 'dark' | 'classic'>('light');
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const { user } = useAuth();

  // Set up text selection event handlers
  const onMouseUp = useCallback((e: React.MouseEvent) => {
    handleTextSelection(e.nativeEvent);
  }, [handleTextSelection]);

  const onDocumentClick = useCallback((e: React.MouseEvent) => {
    // Clear selection when clicking outside text
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) {
      clearSelection();
    }
  }, [clearSelection]);

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
            setCurrentBookId(data.id);
            setCurrentBookTitle(data.title);
            loadBook(data);
            
            // Restore reading position
            if (data.last_read_position) {
              setCurrentPage(parseInt(data.last_read_position) || 1);
            }
          }
        } catch (error) {
          console.error('Error fetching book:', error);
          localStorage.removeItem('currentBookId');
          setCurrentBookId(null);
          setCurrentBookTitle(null);
        }
      }
    };

    fetchCurrentBook();
  }, [user, setCurrentPage, setCurrentBookId, setCurrentBookTitle]);

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

  // Update selection context with current page when page changes
  useEffect(() => {
    setPageNumber(currentPage);
  }, [currentPage, setPageNumber]);

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

  // Clear selection when changing pages
  useEffect(() => {
    clearSelection();
  }, [currentPage, clearSelection]);

  const loadBook = async (book: any) => {
    if (!book || !book.file_path) return;
    
    setIsLoadingText(true);
    setCurrentPageText('');

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
      setIsLoadingText(false);
    }
  };

  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
  };

  // Add observer to track visible pages
  useEffect(() => {
    if (!totalPages || !pdfUrl) return;

    const observerOptions = {
      root: document.querySelector('#pdf-container'),
      rootMargin: '0px',
      threshold: 0.5
    };

    const pageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pageId = entry.target.id;
          const pageNum = parseInt(pageId.split('_')[1]);
          
          if (pageNum !== currentPage) {
            setCurrentPage(pageNum);
          }
        }
      });
    }, observerOptions);

    // Observe all page elements
    for (let i = 1; i <= totalPages; i++) {
      const pageElement = document.getElementById(`page_${i}`);
      if (pageElement) {
        pageObserver.observe(pageElement);
      }
    }

    return () => {
      pageObserver.disconnect();
    };
  }, [totalPages, pdfUrl, currentPage, setCurrentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      
      // Scroll to the selected page
      const pageElement = document.getElementById(`page_${newPage}`);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const extractTextFromPage = async () => {
    if (!pdfUrl) {
      setCurrentPageText('');
      setIsLoadingText(false);
      return;
    }
    
    setIsLoadingText(true);
    
    try {
      const pdf = await pdfjs.getDocument(pdfUrl).promise;
      const page = await pdf.getPage(currentPage);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');
      setCurrentPageText(text);
    } catch (error) {
      console.error('Error extracting text:', error);
      setCurrentPageText('');
      toast({
        title: "Error processing page",
        description: "Could not extract text from the current page",
        variant: "destructive",
      });
    } finally {
      setIsLoadingText(false);
    }
  };

  // Extract text when page changes
  useEffect(() => {
    if (pdfUrl && currentPage > 0) {
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
              disabled={currentPage <= 1 || isLoadingText}
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
              disabled={totalPages === 0 || currentPage >= totalPages || isLoadingText}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Show current book title */}
          {currentBookTitle && (
            <span className="ml-4 text-sm font-medium truncate max-w-[200px]">
              {currentBookTitle}
            </span>
          )}
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
      <div 
        className={`flex-1 overflow-auto p-4 ${themeClasses[theme]}`}
        onClick={onDocumentClick}
      >
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
              options={{
                cMapUrl: 'https://unpkg.com/pdfjs-dist@3.4.120/cmaps/',
                cMapPacked: true,
              }}
            >
              {Array.from(new Array(totalPages), (_, index) => (
                <div key={`page_${index + 1}`} className="mb-8">
                  <div className="text-center text-sm text-muted-foreground mb-2">
                    Page {index + 1} of {totalPages}
                  </div>
                  <Page
                    key={`page_${index + 1}`}
                    pageNumber={index + 1}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className={`border shadow-sm mx-auto ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                    onLoadSuccess={() => {
                      if (index + 1 === currentPage) {
                        // If this is the current page the user was on, scroll to it
                        document.getElementById(`page_${currentPage}`)?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    width={Math.min(window.innerWidth * 0.9, 800)} // Responsive width
                    height={null} // Allow natural height
                    data-page-number={index + 1}
                    onMouseUp={onMouseUp}
                  />
                </div>
              ))}
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
        
        {/* Selection Toolbar Component */}
        <SelectionToolbar />
      </div>
    </div>
  );
};

export default ReadingPanel;
