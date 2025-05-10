
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

interface BookUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BookUploader: React.FC<BookUploaderProps> = ({ open, onOpenChange }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  const handleUpload = () => {
    if (file) {
      toast({
        title: "Book uploaded successfully",
        description: `"${file.name}" has been added to your library.`,
      });
      onOpenChange(false);
      setFile(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <DialogFooter className="sm:justify-between">
          <div>
            <Label htmlFor="book-title" className="text-xs">Book Title (Optional)</Label>
            <Input id="book-title" placeholder="Will use filename if empty" className="mt-1" />
          </div>
          <Button onClick={handleUpload} disabled={!file}>
            Upload Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookUploader;
