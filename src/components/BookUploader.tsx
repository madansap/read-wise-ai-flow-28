
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UploadCloud } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface BookUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BookUploader: React.FC<BookUploaderProps> = ({ open, onOpenChange }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileSelection(droppedFile);
    }
  };
  
  const handleFileSelection = (selectedFile: File) => {
    const validFormats = ["application/pdf", "application/epub+zip", "text/plain"];
    
    if (validFormats.includes(selectedFile.type)) {
      setFile(selectedFile);
      // Auto-fill title with filename (without extension)
      if (!title) {
        const fileNameWithoutExt = selectedFile.name.split(".").slice(0, -1).join(".");
        setTitle(fileNameWithoutExt);
      }
    } else {
      toast({
        title: "Invalid file format",
        description: "Please upload a PDF, EPUB, or TXT file.",
        variant: "destructive"
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !user) return;
      
      setIsUploading(true);
      
      try {
        // 1. Upload file to Supabase storage
        const fileExt = file.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}-${file.name}`;
        
        const { error: uploadError, data } = await supabase.storage
          .from('books')
          .upload(filePath, file);
          
        if (uploadError) throw uploadError;
        
        // 2. Insert record in books table
        const { error: dbError } = await supabase
          .from('books')
          .insert({
            title: title || file.name,
            author: author || null,
            file_path: filePath,
            file_type: file.type,
          });
          
        if (dbError) throw dbError;
        
        return { success: true };
      } finally {
        setIsUploading(false);
      }
    },
    onSuccess: () => {
      toast({
        title: "Book uploaded successfully",
        description: `"${title || file?.name}" has been added to your library.`,
      });
      queryClient.invalidateQueries({ queryKey: ['books'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "There was an error uploading your book.",
        variant: "destructive"
      });
    }
  });

  const handleUpload = () => {
    if (file) {
      uploadMutation.mutate();
    }
  };

  const resetForm = () => {
    setFile(null);
    setTitle("");
    setAuthor("");
    setIsUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Book</DialogTitle>
          <DialogDescription>
            Upload a PDF, EPUB, or TXT file to add a book to your library.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center ${
            isDragging ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
        >
          {!file ? (
            <>
              <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
              <p className="mb-2 text-sm font-medium">
                Drag and drop your file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Supports PDF, EPUB, and TXT files
              </p>
              <Input 
                id="file-upload" 
                type="file"
                className="hidden"
                accept=".pdf,.epub,.txt"
                onChange={handleFileInputChange}
              />
              <Button 
                variant="outline" 
                onClick={() => document.getElementById("file-upload")?.click()}
              >
                Browse Files
              </Button>
            </>
          ) : (
            <>
              <div className="bg-muted rounded p-3 mb-4 flex items-center justify-between">
                <div className="truncate">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  onClick={() => setFile(null)}
                  className="h-8"
                >
                  Change
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="book-title" className="text-xs">Book Title</Label>
            <Input 
              id="book-title" 
              placeholder="Enter book title" 
              className="mt-1" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="book-author" className="text-xs">Author (Optional)</Label>
            <Input 
              id="book-author" 
              placeholder="Enter author name" 
              className="mt-1" 
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-end">
          <Button 
            onClick={handleUpload} 
            disabled={!file || isUploading}
          >
            {isUploading ? "Uploading..." : "Upload Book"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookUploader;
