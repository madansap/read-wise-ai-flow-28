import React from 'react';
import { useReading } from '@/contexts/ReadingContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

// Interface for highlight data
interface Highlight {
  id: string;
  user_id: string;
  book_id: string;
  page_number: number;
  text: string; // The field name in the database
  color: string;
  created_at: string;
}

const HighlightedText = () => {
  const { currentBookId, currentPage } = useReading();
  const { user } = useAuth();

  // Fetch highlights for the current page
  const { data: highlights = [] } = useQuery({
    queryKey: ['highlights', currentBookId, currentPage],
    queryFn: async () => {
      if (!currentBookId || !user || !currentPage) {
        return [];
      }
      
      try {
        // Query highlights directly
        const { data, error } = await supabase
          .from('highlights')
          .select('*')
          .eq('book_id', currentBookId)
          .eq('user_id', user.id)
          .eq('page_number', currentPage)
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        
        return data || [];
      } catch (error) {
        console.error('Error fetching highlights:', error);
        return [];
      }
    },
    enabled: !!currentBookId && !!user && !!currentPage,
  });

  if (!highlights.length) {
    return null;
  }

  return (
    <div className="highlights-container">
      {highlights.map((highlight) => (
        <div
          key={highlight.id}
          className="highlight-marker"
          style={{
            backgroundColor: highlight.color,
            // We'd need to calculate positions based on text ranges
            // This is placeholder - actual implementation would need text rects
            top: '0',
            left: '0',
            width: '100%',
            height: '20px'
          }}
          title={highlight.text}
        />
      ))}
    </div>
  );
};

export default HighlightedText; 