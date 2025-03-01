// src/components/shared/ModalLayout.tsx

interface ModalLayoutProps {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
    customButtons?: React.ReactNode;
    onNext?: () => void;
    nextLabel?: string;
  }
  
  export default function ModalLayout({
    isOpen,
    title,
    children,
    customButtons,
    onNext,
    nextLabel = 'Next'
  }: ModalLayoutProps) {
    if (!isOpen) return null;
  
    const handleClose = () => {
      window.location.reload();
    };
  
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg w-96">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">{title}</h2>
            <button 
              onClick={handleClose}
              type="button"
              className="text-gray-500 hover:text-gray-700 text-xl font-medium"
            >
              ×
            </button>
          </div>
          
          {children}
  
          {customButtons || (
            <div className="flex justify-end items-center gap-2 mt-6">
              {onNext && (
                <button
                  onClick={onNext}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  disabled={!onNext}
                >
                  {nextLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }