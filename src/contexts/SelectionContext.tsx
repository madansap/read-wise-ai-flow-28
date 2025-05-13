import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

// Interface for selection position
interface SelectionPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Interface for the context values
interface SelectionContextType {
  selectedText: string;
  setSelectedText: (text: string) => void;
  selectionPosition: SelectionPosition | null;
  setSelectionPosition: (position: SelectionPosition | null) => void;
  pageNumber: number;
  setPageNumber: (page: number) => void;
  isSelectionToolbarVisible: boolean;
  setIsSelectionToolbarVisible: (visible: boolean) => void;
  handleTextSelection: (event: MouseEvent) => void;
  clearSelection: () => void;
}

// Create the context with undefined initial value
const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

// Provider component
export const SelectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionPosition, setSelectionPosition] = useState<SelectionPosition | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(0);
  const [isSelectionToolbarVisible, setIsSelectionToolbarVisible] = useState<boolean>(false);

  // Handle text selection
  const handleTextSelection = useCallback((event: MouseEvent) => {
    const selection = window.getSelection();
    
    if (selection && selection.toString().trim().length > 0) {
      // Get selected text
      const text = selection.toString().trim();
      setSelectedText(text);
      
      // Get selection position for toolbar placement
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        setSelectionPosition({
          x: rect.left + rect.width / 2, // Center of selection
          y: rect.top - 10, // Slightly above selection
          width: rect.width,
          height: rect.height
        });
        
        // Make toolbar visible
        setIsSelectionToolbarVisible(true);
      } catch (error) {
        console.error('Error getting selection position:', error);
        setSelectionPosition(null);
      }
    } else {
      clearSelection();
    }
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedText('');
    setSelectionPosition(null);
    setIsSelectionToolbarVisible(false);
  }, []);

  // The value provided to consuming components
  const value = {
    selectedText,
    setSelectedText,
    selectionPosition,
    setSelectionPosition,
    pageNumber,
    setPageNumber,
    isSelectionToolbarVisible,
    setIsSelectionToolbarVisible,
    handleTextSelection,
    clearSelection
  };

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
};

// Custom hook to use the context
export const useSelection = () => {
  const context = useContext(SelectionContext);
  if (context === undefined) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return context;
}; 