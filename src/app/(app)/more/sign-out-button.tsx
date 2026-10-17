/** A plain form post, so signing out always completes (no client state to get stuck). */
export function SignOutButton({ className = "btn-ghost" }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button className={className}>Sign out</button>
    </form>
  );
}
