import React, { useState } from 'react';
import { Lightbulb, PenTool, Highlighter, X, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSelection } from '@/contexts/SelectionContext';
import { useReading } from '@/contexts/ReadingContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Define highlight color options
const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: 'bg-yellow-200 dark:bg-yellow-800/50', class: 'bg-yellow-200 dark:bg-yellow-800' },
  { name: 'Green', value: 'bg-green-200 dark:bg-green-800/50', class: 'bg-green-200 dark:bg-green-800' },
  { name: 'Blue', value: 'bg-blue-200 dark:bg-blue-800/50', class: 'bg-blue-200 dark:bg-blue-800' },
  { name: 'Purple', value: 'bg-purple-200 dark:bg-purple-800/50', class: 'bg-purple-200 dark:bg-purple-800' },
  { name: 'Pink', value: 'bg-pink-200 dark:bg-pink-800/50', class: 'bg-pink-200 dark:bg-pink-800' },
];

const SelectionToolbar = () => {
  const { 
    selectedText, 
    selectionPosition, 
    isSelectionToolbarVisible, 
    clearSelection,
    pageNumber 
  } = useSelection();
  const { currentBookId, currentPage } = useReading();
  const { user } = useAuth();
  
  // States for each feature
  const [isExplainDialogOpen, setIsExplainDialogOpen] = useState(false);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [isHighlightPopoverOpen, setIsHighlightPopoverOpen] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0].value);
  const [isSavingHighlight, setIsSavingHighlight] = useState(false);

  // Hide toolbar if no selection
  if (!isSelectionToolbarVisible || !selectionPosition) {
    return null;
  }

  // Position the toolbar above the selection
  const toolbarStyle = {
    position: 'fixed' as const,
    top: `${selectionPosition.y - 50}px`, // Slightly higher above the text
    left: `${selectionPosition.x}px`,
    transform: 'translateX(-50%)',
    zIndex: 9999,
    opacity: 1,
    transition: 'opacity 0.2s ease, transform 0.2s ease'
  };

  // Handle explain button click
  const handleExplain = async () => {
    if (!selectedText || !currentBookId) return;
    
    setIsExplainDialogOpen(true);
    setIsExplaining(true);
    setExplanation('');
    
    try {
      const response = await supabase.functions.invoke('ai-assistant', {
        body: {
          bookContent: selectedText,
          mode: "explainSelection"
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      setExplanation(response.data.response);
    } catch (error) {
      console.error('Error explaining selection:', error);
      toast({
        title: "Error explaining selection",
        description: "Could not get explanation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExplaining(false);
    }
  };

  // Handle save note button click
  const handleSaveNote = async () => {
    if (!selectedText || !currentBookId || !user) return;
    
    setIsNoteDialogOpen(true);
    setNoteTitle('');
    setNoteContent('');
  };

  // Save note to database
  const saveNote = async () => {
    if (!selectedText || !currentBookId || !user || !noteTitle) {
      toast({
        title: "Missing information",
        description: "Please provide a title for your note.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSavingNote(true);
    
    try {
      // Create new note record directly
      const { error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          book_id: currentBookId,
          page_number: currentPage,
          selected_text: selectedText,
          title: noteTitle,
          content: noteContent,
          color: selectedColor
        });
        
      if (error) throw error;
      
      toast({
        title: "Note saved",
        description: "Your note has been saved successfully.",
      });
      
      setIsNoteDialogOpen(false);
      setNoteTitle('');
      setNoteContent('');
      clearSelection();
    } catch (error: any) {
      console.error('Error saving note:', error);
      toast({
        title: "Error saving note",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSavingNote(false);
    }
  };

  // Handle highlight button click
  const handleHighlight = () => {
    setIsHighlightPopoverOpen(true);
  };

  // Save highlight to database
  const saveHighlight = async (color: string) => {
    if (!selectedText || !currentBookId || !user) return;
    
    setIsSavingHighlight(true);
    
    try {
      // Create new highlight record directly
      const { error } = await supabase
        .from('highlights')
        .insert({
          user_id: user.id,
          book_id: currentBookId,
          page_number: currentPage,
          text: selectedText, // Match the database column name
          color: color
        });
        
      if (error) throw error;
      
      toast({
        title: "Text highlighted",
        description: "Highlight saved successfully.",
      });
      
      setIsHighlightPopoverOpen(false);
      clearSelection();
    } catch (error: any) {
      console.error('Error saving highlight:', error);
      toast({
        title: "Error saving highlight",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSavingHighlight(false);
    }
  };

  // Copy explanation to clipboard
  const copyExplanation = () => {
    navigator.clipboard.writeText(explanation);
    toast({
      title: "Copied",
      description: "Explanation copied to clipboard",
    });
  };

  return (
    <>
      {/* Selection Toolbar */}
      <div 
        style={toolbarStyle} 
        className="selection-toolbar bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg flex items-center p-1.5 gap-1 animate-in fade-in slide-in-from-top-5 duration-200"
        onMouseDown={(e) => e.stopPropagation()} 
      >
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900" 
          title="Explain" 
          onClick={handleExplain}
        >
          <Lightbulb className="h-4 w-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900" 
          title="Add Note" 
          onClick={handleSaveNote}
        >
          <PenTool className="h-4 w-4" />
        </Button>
        <Popover open={isHighlightPopoverOpen} onOpenChange={setIsHighlightPopoverOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900" 
              title="Highlight" 
              onClick={handleHighlight}
            >
              <Highlighter className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="center">
            <div className="space-y-2">
              <p className="text-sm font-medium">Select highlight color</p>
              <div className="flex flex-wrap gap-2">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color.name}
                    onClick={() => saveHighlight(color.value)}
                    disabled={isSavingHighlight}
                    className={`w-8 h-8 rounded-full ${color.class} border hover:scale-110 transition-transform`}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Explanation Dialog */}
      <Dialog open={isExplainDialogOpen} onOpenChange={setIsExplainDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Explanation</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {isExplaining ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-muted p-3 rounded-md text-sm">
                  <p className="font-medium">Selected text:</p>
                  <p className="italic">{selectedText}</p>
                </div>
                <div className="prose prose-sm dark:prose-invert">
                  {explanation}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={copyExplanation} disabled={isExplaining}>
              <Copy className="h-4 w-4 mr-2" /> Copy
            </Button>
            <Button variant="default" onClick={() => setIsExplainDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-3 rounded-md text-sm">
              <p className="font-medium">Selected text:</p>
              <p className="italic">{selectedText}</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="note-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="note-title"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Enter a title for your note"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="note-content" className="text-sm font-medium">
                Note (optional)
              </label>
              <Textarea
                id="note-content"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Add your thoughts..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <div className="flex flex-wrap gap-2">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color.name}
                    onClick={() => setSelectedColor(color.value)}
                    className={`w-8 h-8 rounded-full ${color.class} border hover:scale-110 transition-transform ${
                      selectedColor === color.value ? 'ring-2 ring-primary ring-offset-2' : ''
                    }`}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="default" 
              onClick={saveNote} 
              disabled={isSavingNote || !noteTitle}
            >
              {isSavingNote ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent mr-2" />
              ) : null}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SelectionToolbar; 