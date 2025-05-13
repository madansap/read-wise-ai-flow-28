
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
      
      const { error: uploadError } = await supabase.storage
        .from('books')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Step 2: Save book metadata to the books table
      const { error: insertError } = await supabase
        .from('books')
        .insert({
          title: metadata.title,
          author: metadata.author || null,
          file_path: filePath,
          file_type: file.type,
          user_id: user.id
        });

      if (insertError) throw insertError;

      toast({
        title: "Book uploaded",
        description: "Your book has been uploaded successfully",
      });
      
      if (onUploadSuccess) onUploadSuccess();
      
      // Reset form
      setFile(null);
      setMetadata({ title: '', author: '' });
    } catch (error: any) {
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
