
import React, { createContext, useState, useContext, ReactNode } from 'react';

// Interface for the context values
interface ReadingContextType {
  currentPageText: string;
  setCurrentPageText: (text: string) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  setTotalPages: (pages: number) => void;
  isLoadingText: boolean;
  setIsLoadingText: (loading: boolean) => void;
  currentBookId: string | null;
  setCurrentBookId: (id: string | null) => void;
  currentBookTitle: string | null;
  setCurrentBookTitle: (title: string | null) => void;
  workerInitialized: boolean;
  setWorkerInitialized: (initialized: boolean) => void;
}

// Create the context with undefined initial value
const ReadingContext = createContext<ReadingContextType | undefined>(undefined);

// Provider component
export const ReadingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentPageText, setCurrentPageText] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [isLoadingText, setIsLoadingText] = useState<boolean>(false);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [currentBookTitle, setCurrentBookTitle] = useState<string | null>(null);
  const [workerInitialized, setWorkerInitialized] = useState<boolean>(false);

  // The value provided to consuming components
  const value = {
    currentPageText,
    setCurrentPageText,
    currentPage,
    setCurrentPage,
    totalPages,
    setTotalPages,
    isLoadingText,
    setIsLoadingText,
    currentBookId,
    setCurrentBookId,
    currentBookTitle,
    setCurrentBookTitle,
    workerInitialized,
    setWorkerInitialized
  };

  return (
    <ReadingContext.Provider value={value}>
      {children}
    </ReadingContext.Provider>
  );
};

// Custom hook to use the context
export const useReading = () => {
  const context = useContext(ReadingContext);
  if (context === undefined) {
    throw new Error('useReading must be used within a ReadingProvider');
  }
  return context;
}; 
