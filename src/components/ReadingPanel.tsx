
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { usePdfWorker } from '@/hooks/usePdfWorker';

const ReadingPanel = () => {
  // Use the ReadingContext
  const { 
    currentPage, setCurrentPage,
    totalPages, setTotalPages,
    currentPageText, setCurrentPageText,
    isLoadingText, setIsLoadingText,
    currentBookId, setCurrentBookId,
    currentBookTitle, setCurrentBookTitle,
    workerInitialized
  } = useReading();

  // Initialize PDF worker
  usePdfWorker();

  // Use the SelectionContext
  const { 
    handleTextSelection, 
    clearSelection,
    setPageNumber,
    isSelectionToolbarVisible
  } = useSelection();
  
  const [theme, setTheme] = useState<'light' | 'dark' | 'classic'>('light');
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const { user } = useAuth();
  const [renderTextLayer, setRenderTextLayer] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);
  const [isDocumentLoading, setIsDocumentLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  // Reference to the container for additional event listeners
  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false); // Track programmatic scrolls
  
  // Set up text selection event handler (do not block default behavior)
  const onMouseUp = useCallback((e: React.MouseEvent) => {
    // Add a small delay to ensure the selection is complete
    setTimeout(() => {
      handleTextSelection(e.nativeEvent);
    }, 0);
  }, [handleTextSelection]);

  // Add click handler to clear selection when clicking outside
  const onContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      clearSelection();
    }
  }, [clearSelection]);

  // Add event listeners for selection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Add click handler to container
    container.addEventListener('click', onContainerClick as any);

    return () => {
      container.removeEventListener('click', onContainerClick as any);
    };
  }, [onContainerClick]);

  // Load the current book from localStorage or fetch from database
  useEffect(() => {
    // Don't proceed until worker is initialized
    if (!workerInitialized) return;

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
  }, [user, setCurrentPage, setCurrentBookId, setCurrentBookTitle, workerInitialized]);

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
    
    // Reset states
    setIsLoadingText(true);
    setCurrentPageText('');
    setPdfDocument(null);
    setPdfError(null);
    setIsDocumentLoaded(false);
    setIsDocumentLoading(true);
    setRenderTextLayer(false); // Disable text layer initially
    setLoadingProgress(0);
    
    try {
      // Clean up any existing PDF URL to avoid caching issues
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      
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
      setIsDocumentLoading(false);
      setPdfError("Failed to load the PDF. Please try again later.");
    }
  };

  const handleDocumentLoadProgress = ({ loaded, total }: { loaded: number, total: number }) => {
    const progress = Math.min(100, Math.round(loaded / total * 100));
    setLoadingProgress(progress);
  };

  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
    setIsDocumentLoaded(true);
    setIsDocumentLoading(false);
    setLoadingProgress(100);
    setRetryCount(0); // Reset retry count on successful load
    
    // Enable text layer after ensuring document is fully loaded
    setTimeout(() => {
      setRenderTextLayer(true);
    }, 1000);
  };
  
  const handleDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF document:', error);
    setIsDocumentLoading(false);
    
    // Implement retry logic
    if (retryCount < 3 && pdfUrl) {
      setRetryCount(prev => prev + 1);
      toast({
        title: "Retrying document load",
        description: `Attempt ${retryCount + 1}/3`,
      });
      
      // Wait a moment and try loading again
      setTimeout(() => {
        // Force a refresh of the URL to avoid caching issues
        setPdfUrl(null);
        setTimeout(() => {
          if (selectedBook) {
            loadBook(selectedBook);
          }
        }, 500);
      }, 1000);
    } else {
      setPdfError("Failed to load the PDF. Please try again later.");
      toast({
        title: "Error loading document",
        description: error.message || "Could not load the PDF document",
        variant: "destructive",
      });
    }
  };

  // Add observer to track visible pages
  useEffect(() => {
    if (!totalPages || !pdfUrl || !isDocumentLoaded || isSelectionToolbarVisible) return;

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
          // Only update if not programmatic scroll
          if (!isProgrammaticScroll.current && pageNum !== currentPage) {
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
  }, [totalPages, pdfUrl, currentPage, setCurrentPage, isSelectionToolbarVisible, isDocumentLoaded]);

  // Scroll to the selected page
  const scrollToPage = (pageNum: number) => {
    const pageElement = document.getElementById(`page_${pageNum}`);
    if (pageElement) {
      isProgrammaticScroll.current = true;
      pageElement.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 700); // Allow time for scroll to finish
    }
  };

  // On initial load, scroll to last viewed page
  useEffect(() => {
    if (pdfUrl && currentPage > 0 && isDocumentLoaded) {
      // Wait for a short time to ensure pages are rendered
      setTimeout(() => {
        scrollToPage(currentPage);
      }, 800);
    }
  }, [pdfUrl, isDocumentLoaded]);

  // Update handlePageChange to use scrollToPage
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      scrollToPage(newPage);
    }
  };

  const extractTextFromPage = async () => {
    if (!pdfUrl || !isDocumentLoaded) {
      setCurrentPageText('');
      setIsLoadingText(false);
      return;
    }
    
    setIsLoadingText(true);
    
    try {
      if (!pdfDocument) {
        // Load the document
        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@3.4.120/cmaps/',
          cMapPacked: true,
          disableAutoFetch: false,
          disableStream: false,
        });
        
        loadingTask.onProgress = (progressData) => {
          console.log(`Loading PDF: ${Math.round(progressData.loaded / progressData.total * 100)}%`);
        };
        
        try {
          const pdf = await loadingTask.promise;
          setPdfDocument(pdf);
          
          // First ensure page number is valid
          if (currentPage < 1 || currentPage > pdf.numPages) {
            throw new Error(`Invalid page number: ${currentPage}`);
          }
          
          const page = await pdf.getPage(currentPage);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item: any) => item.str).join(' ');
          setCurrentPageText(text || `[Page ${currentPage} contains no extractable text]`);
        } catch (error) {
          console.error('Error loading PDF or getting page text:', error);
          setCurrentPageText(`[Unable to extract text from page ${currentPage}]`);
        }
      } else {
        try {
          // First ensure page number is valid
          if (currentPage < 1 || currentPage > pdfDocument.numPages) {
            throw new Error(`Invalid page number: ${currentPage}`);
          }
          
          const page = await pdfDocument.getPage(currentPage);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item: any) => item.str).join(' ');
          setCurrentPageText(text || `[Page ${currentPage} contains no extractable text]`);
        } catch (error) {
          console.error('Error getting page text:', error);
          setCurrentPageText(`[Unable to extract text from page ${currentPage}]`);
        }
      }
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

  // Extract text when page changes and document is loaded
  useEffect(() => {
    if (pdfUrl && currentPage > 0 && isDocumentLoaded) {
      extractTextFromPage();
    }
  }, [currentPage, pdfUrl, isDocumentLoaded]);

  // Theme class mappings
  const themeClasses = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-gray-100',
    classic: 'bg-[#f8f2e4] text-gray-900 font-serif'
  };

  // Create document options object once to avoid unnecessary re-renders
  const documentOptions = React.useMemo(() => ({
    cMapUrl: 'https://unpkg.com/pdfjs-dist@3.4.120/cmaps/',
    cMapPacked: true,
    disableAutoFetch: false,
    disableStream: false,
  }), []);

  return (
    <div className="h-full flex flex-col">
      {/* Top controls */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {/* Show current book title */}
          {currentBookTitle && (
            <span className="ml-0 text-sm font-medium truncate max-w-[200px]">
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
        ref={containerRef}
        className={`flex-1 overflow-auto p-4 ${themeClasses[theme]}`}
      >
        {!workerInitialized ? (
          <div className="flex justify-center items-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
              <p>Initializing PDF reader...</p>
            </div>
          </div>
        ) : selectedBook && pdfUrl ? (
          <div id="pdf-container" className="flex justify-center">
            {isDocumentLoading && !isDocumentLoaded && !pdfError && (
              <div className="flex flex-col justify-center items-center h-64 mt-8">
                <div className="w-48 h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
                  <div 
                    className="h-full bg-primary transition-all duration-300 ease-in-out" 
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                <p className="text-muted-foreground">Loading document... {loadingProgress}%</p>
              </div>
            )}
            
            {pdfError && (
              <div className="text-center p-8 mt-8">
                <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-4 max-w-md">
                  <p className="text-red-600 dark:text-red-400 font-medium">{pdfError}</p>
                  <Button 
                    variant="outline" 
                    className="mt-4" 
                    onClick={() => {
                      setPdfError(null);
                      setRetryCount(0);
                      if (selectedBook) loadBook(selectedBook);
                    }}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}
            
            {!pdfError && (
              <Document
                file={pdfUrl}
                onLoadSuccess={handleDocumentLoadSuccess}
                onLoadError={handleDocumentLoadError}
                onLoadProgress={handleDocumentLoadProgress}
                options={documentOptions}
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
                externalLinkTarget="_blank"
              >
                {isDocumentLoaded && Array.from(new Array(totalPages), (_, index) => (
                  <div key={`page_${index + 1}`} id={`page_${index + 1}`} className="mb-8" onMouseUp={onMouseUp}>
                    <div className="text-center text-sm text-muted-foreground mb-2">
                      Page {index + 1} of {totalPages}
                    </div>
                    <div className="relative">
                      <Page
                        key={`page_${index + 1}`}
                        pageNumber={index + 1}
                        renderTextLayer={renderTextLayer}
                        renderAnnotationLayer={false}
                        className={`border shadow-sm mx-auto ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                        onLoadSuccess={() => {
                          if (index + 1 === currentPage) {
                            setIsLoadingText(false);
                          }
                        }}
                        onRenderError={(error) => {
                          console.error(`Error rendering page ${index + 1}:`, error);
                        }}
                        width={Math.min(window.innerWidth * 0.9, 800)}
                        height={null}
                        data-page-number={index + 1}
                        error={
                          <div className="flex justify-center items-center p-4 border border-red-300 bg-red-50 text-red-700 rounded">
                            <p>Error loading page {index + 1}</p>
                          </div>
                        }
                      />
                    </div>
                  </div>
                ))}
              </Document>
            )}
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
