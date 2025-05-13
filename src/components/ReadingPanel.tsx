
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Sun, Moon, BookOpen } from 'lucide-react';

const ReadingPanel = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark' | 'classic'>('light');
  const [selectedBook, setSelectedBook] = useState(null);

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
            <Button variant="outline" size="icon" disabled={currentPage <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages || '?'}
            </span>
            <Button variant="outline" size="icon" disabled={totalPages === 0 || currentPage >= totalPages}>
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
        {selectedBook ? (
          <div id="pdf-container" className="min-h-full">
            {/* PDF content will be rendered here */}
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
