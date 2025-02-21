// src/components/canvas/ConfirmPlacement.tsx
import ModalLayout from '../shared/ModalLayout';

interface ConfirmPlacementProps {
  position: { x: number; y: number };
  onConfirm: () => void;
  onReposition: () => void;
}

export default function ConfirmPlacement({
  position,
  onConfirm,
  onReposition
}: ConfirmPlacementProps) {
  const handleClose = () => {
    window.location.reload();
  };

  return (
    <ModalLayout
      isOpen={true}
      title="Position Image"
      onClose={handleClose}
      customButtons={
        <div className="flex justify-end items-center gap-2 mt-6">
          <button
            onClick={onReposition}
            className="px-4 py-2 border rounded hover:bg-gray-100"
          >
            Reposition
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Confirm
          </button>
        </div>
      }
    >
      <p className="text-center mb-4">
        Confirm image placement at position ({position.x}, {position.y})?
      </p>
    </ModalLayout>
  );
}