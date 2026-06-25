export function ApiError() {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-medium">Unable to load backend data.</p>
      <p className="mt-1 text-pretty">
        Start the backend on port 8000, then refresh this page.
      </p>
    </div>
  );
}
