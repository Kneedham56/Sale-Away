export default function Loading() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-accent" />
    </div>
  );
}
