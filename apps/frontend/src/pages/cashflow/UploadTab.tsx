import { useCallback } from 'react';
import FileUpload from '@/components/FileUpload';
import PageHeader from '@/components/PageHeader';

const UploadTab = () => {
  const handleFileUpload = useCallback((files: File[]) => {
    console.log('Files uploaded:', files.map((f) => f.name));
  }, []);

  return (
    <div className="p-8 bg-background min-h-full">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Upload Transactions"
          subtitle="Import your bank statements and transaction files"
        />
        <div className="mt-[15vh]">
          <FileUpload onFileUpload={handleFileUpload} />
        </div>
      </div>
    </div>
  );
};

export default UploadTab;
