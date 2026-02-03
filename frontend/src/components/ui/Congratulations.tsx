import { Button } from "@/components/retroui/Button";

interface CongratulationsProps {
  isOpen: boolean;
  onClose: () => void;
  itemCount: number;
}

export function Congratulations({
  isOpen,
  onClose,
  itemCount,
}: CongratulationsProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[#fdf4c4] border-4 border-border shadow-xl max-w-md w-full p-8 animate-in fade-in zoom-in duration-200">
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-4xl font-head mb-4">Congratulations!</h2>
            <p className="text-lg font-sans mb-6">
              Your package with{" "}
              <span className="font-bold">{itemCount} items</span> has been
              saved successfully!
            </p>
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
