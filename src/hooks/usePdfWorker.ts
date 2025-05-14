
import { useEffect } from 'react';
import { pdfjs } from 'react-pdf';
import { useReading } from '@/contexts/ReadingContext';
import { toast } from '@/components/ui/use-toast';

/**
 * Hook to initialize the PDF.js worker
 */
export const usePdfWorker = () => {
  const { workerInitialized, setWorkerInitialized } = useReading();

  useEffect(() => {
    // Only initialize once
    if (workerInitialized) return;

    try {
      // Set the worker path with an explicit version to ensure compatibility
      const workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      
      console.log('PDF.js worker initialized with version:', pdfjs.version);
      setWorkerInitialized(true);
    } catch (error) {
      console.error('Failed to initialize PDF worker:', error);
      toast({
        title: 'PDF Reader Error',
        description: 'Could not initialize the PDF reader. Please try reloading the page.',
        variant: 'destructive',
      });
    }
  }, [workerInitialized, setWorkerInitialized]);

  return { workerInitialized };
};
