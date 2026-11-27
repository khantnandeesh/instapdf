/**
 * Inline <head> script: records the visitor's last input on <html data-input="pointer|keyboard">
 * (capture phase, before any handler can stop it). globals.css hides every focus ring after a mouse,
 * pen or touch action, including focus the page moves itself (after a removal, a pick, a dialog), and
 * the next key press brings rings back at once. Fields keep their own focus edge either way.
 */
const SCRIPT = `(function(){var d=document.documentElement,o={capture:true,passive:true};function p(){d.dataset.input="pointer"}addEventListener("pointerdown",p,o);addEventListener("drop",p,o);addEventListener("keydown",function(e){var k=e.key;if(k==="Control"||k==="Meta"||k==="Alt"||k==="Shift")return;d.dataset.input="keyboard"},o)})()`;

export function InputModalityScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
