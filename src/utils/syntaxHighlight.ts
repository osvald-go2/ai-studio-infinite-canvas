export function highlight(code: string, language: string): string {
  let highlighted = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Strings (green)
    .replace(/("(?:\\"|[^"])*"|'(?:\\'|[^'])*'|`(?:\\`|[^`])*`)/g, '<span class="text-emerald-400">$1</span>')
    // Numbers (orange)
    .replace(/\b(\d+)\b/g, '<span class="text-orange-400">$1</span>')
    // Comments (translucent gray)
    .replace(/(\/\/.*|\/\*[\s\S]*?\*\/|#.*)/g, '<span class="text-gray-500/70 italic">$1</span>')
    // Keywords (blue)
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|class|interface|type|public|private|protected|await|async|true|false|null|undefined|npm|run|deploy|--only)\b/g, '<span class="text-blue-400">$1</span>');
  
  return highlighted;
}
