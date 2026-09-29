import { redirect } from 'next/navigation'

// The solo entry moved to /solo/rules; keep old plain /solo links working.
export default function SoloPage() {
  redirect('/solo/rules')
}
