
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';

const BookUploader = ({ onUploadSuccess }: { onUploadSuccess?: () => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [metadata, setMetadata] = useState({
    title: '',
    author: ''
  });
  const { user } = useAuth();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 50 * 1024 * 1024) { // 50MB limit
      toast({
        title: "File too large",
        description: "Please select a file under 50MB",
        variant: "destructive",
      });
      return;
    }

    if (selectedFile.type !== "application/pdf") {
      toast({
        title: "Invalid file type",
        description: "Please select a PDF file",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);
    
    // Extract title from filename (remove extension)
    const fileName = selectedFile.name.replace(/\.[^/.]+$/, "");
    setMetadata(prev => ({
      ...prev,
      title: fileName
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMetadata(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleUpload = async () => {
    if (!file || !user) return;

    try {
      setIsUploading(true);

      // Step 1: Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${uuidv4()}.${fileExt}`;
      
      // Add retry logic for file upload
      let uploadAttempts = 0;
      const maxUploadAttempts = 3;
      let uploadError = null;
      
      while (uploadAttempts < maxUploadAttempts) {
        try {
          const { error } = await supabase.storage
            .from('books')
            .upload(filePath, file);
          
          if (!error) {
            uploadError = null;
            break; // Success, exit loop
          }
          
          uploadError = error;
          uploadAttempts++;
          console.log(`Upload attempt ${uploadAttempts} failed: ${error.message}`);
          
          if (uploadAttempts < maxUploadAttempts) {
            // Wait with exponential backoff before retrying
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, uploadAttempts)));
          }
        } catch (err) {
          uploadError = err;
          uploadAttempts++;
          console.error(`Upload attempt ${uploadAttempts} error:`, err);
          
          if (uploadAttempts < maxUploadAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, uploadAttempts)));
          }
        }
      }

      if (uploadError) throw uploadError;

      // Step 2: Save book metadata to the books table with better error handling
      let insertAttempts = 0;
      const maxInsertAttempts = 2;
      let bookId = null;
      let insertError = null;
      
      while (insertAttempts < maxInsertAttempts) {
        try {
          const { data, error } = await supabase
            .from('books')
            .insert({
              title: metadata.title,
              author: metadata.author || null,
              file_path: filePath,
              file_type: file.type,
              user_id: user.id,
              is_processed: false,
              processing_status: 'Queued for processing'
            })
            .select('id')
            .single();

          if (error) {
            insertError = error;
            insertAttempts++;
          } else {
            bookId = data.id;
            insertError = null;
            break; // Success, exit loop
          }
          
          if (insertAttempts < maxInsertAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (err) {
          insertError = err;
          insertAttempts++;
          console.error(`Book metadata insert attempt ${insertAttempts} error:`, err);
          
          if (insertAttempts < maxInsertAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      if (insertError || !bookId) throw insertError || new Error("Failed to insert book metadata");
      
      // Step 3: Trigger the PDF processing function with more robust retry logic
      toast({
        title: "Book uploaded",
        description: "Your book is being processed. This may take a few minutes.",
      });
      
      try {
        // Add improved retry logic for more robust processing
        let retryCount = 0;
        const maxRetries = 3;
        let processingError;
        
        while (retryCount <= maxRetries) {
          try {
            console.log(`Attempting to process book (attempt ${retryCount + 1}/${maxRetries + 1})`);
            
            // Add a short delay before the first attempt to ensure database consistency
            if (retryCount === 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Prepare all required params explicitly
            const processingParams = {
              book_id: bookId,
              user_id: user.id,
              file_path: filePath,
              endpoint: 'extract-pdf-text' 
            };
            
            console.log("Sending processing request with params:", {
              bookId,
              userId: user.id,
              filePath
            });
            
            // Call the extract-pdf-text endpoint with all required parameters
            const response = await supabase.functions.invoke('ai-assistant', {
              body: processingParams
            });
            
            if (response.error) {
              throw response.error;
            }
            
            // Check for success field in the response data
            if (!response.data || response.data.success === false) {
              const errorMessage = response.data?.message || response.data?.error || "Unknown processing error";
              console.error('Processing error from Edge Function:', errorMessage);
              throw new Error(errorMessage);
            }
            
            console.log('Book processing initiated successfully:', response.data);
            processingError = null;
            break; // Success, exit retry loop
          } catch (error: any) {
            processingError = error;
            console.error(`Error triggering PDF processing (attempt ${retryCount + 1}):`, error);
            retryCount++;
            
            if (retryCount <= maxRetries) {
              // Wait with exponential backoff before retrying (2s, 4s, 8s)
              await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retryCount - 1)));
            }
          }
        }
        
        if (processingError) {
          console.error("All processing attempts failed:", processingError);
          // Don't throw here, as the book was already uploaded successfully
          toast({
            title: "Processing started with warnings",
            description: "Your book was uploaded but processing may be delayed. You can try manual processing from the library.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Processing initiated",
            description: "Book processing has started. This may take several minutes depending on the book size.",
          });
        }
      } catch (processingError: any) {
        console.error("Error in PDF processing:", processingError);
        toast({
          title: "PDF processing issue",
          description: "Your book was uploaded but text extraction may be delayed. You can try manual processing from the library.",
          variant: "destructive",
        });
      }
      
      if (onUploadSuccess) onUploadSuccess();
      
      // Reset form
      setFile(null);
      setMetadata({ title: '', author: '' });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Upload PDF Book (max 50MB)</Label>
            <div className="flex items-center gap-4">
              <Input
                id="file-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button 
                variant="outline" 
                className="w-full h-24 border-dashed"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <div className="flex flex-col items-center justify-center space-y-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    {file ? file.name : "Click to browse"}
                  </div>
                </div>
              </Button>
            </div>
          </div>

          {file && (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  value={metadata.title}
                  onChange={handleInputChange}
                  placeholder="Book Title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="author">Author (optional)</Label>
                <Input
                  id="author"
                  name="author"
                  value={metadata.author}
                  onChange={handleInputChange}
                  placeholder="Author Name"
                />
              </div>

              <Button 
                className="w-full" 
                onClick={handleUpload}
                disabled={isUploading || !metadata.title}
              >
                {isUploading ? "Uploading..." : "Upload Book"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default BookUploader;
