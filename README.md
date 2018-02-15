# Bookmarklets

Oh you know, just some silly bookmarklets...

## Silly Flexbox Mayhem

or: "Hexaflexagone.js", or whatever - 'cause it makes the UI git gone (and it's unintuitive, in how it flexes)

[Go here to get the bookmarklet.](https://1j01.github.io/bookmarklets)
(I can't make a `javascript:` link on a GitHub README, that would be a huge security issue!)

It toggles between two different layouts
(but not the original layout; for that you'll have to delete the stylesheet (`<link id="bookmarklet-custom-css">` or `<link id="bookmarklet-custom-css-2">` in `<head>`))

Unminified and sane-ified:

```js
function applyTo(window){
	var stylesheetID = "bookmarklet-custom-css";
	var link = window.document.getElementById(stylesheetID) || window.document.head.appendChild(window.document.createElement("style"));
	link.id = stylesheetID;

	var css = `
body,
body *:not(style):not(script) {
	display: flex;
	flex: 1;
	transition: flex .2s ease;
}
body *:hover {
	flex: 2;
}
`;
	link.reverse = !link.reverse;
	var reverse = link.reverse;
	var i = 5;
	while (i--) {
		css += `
body${Array(i).join(" > *")} {
	flex-direction: ${((i % 2) ^ reverse) ? "row" : "column"};
}`;
	}
	link.textContent = css;
}
if (frames.length) {
	Array.from(frames).forEach(applyTo);
} else {
	applyTo(window);
}
```

## More to come

I've got more of these that I might add,
including some funky CSS filter animation ones
and some actually potentially useful ones like for controlling YouTube (or other video) playback.
So far I've just created this repo because I was unminifying this bookmarklet,
and it seemed like there should be a place for it to go.

Also this bookmarklet could be made way more fun pretty easily by assigning specific `flex` values etc. in a similar fasion (i.e. maybe going `1 2 3 1 2 3` with `i % 3`)
