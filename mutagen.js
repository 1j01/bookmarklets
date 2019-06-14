var button = document.getElementById("mutate") || document.createElement("button");
button.id = "mutate";
button.textContent = "☢ MUTATE ☢";
document.querySelector("#controls").appendChild(button);
button.onclick = ()=> {
	var textarea = document.querySelector("#code");
	var mutation_chance = 0.05 + 1 / textarea.value.length;

	var new_code = textarea.value.replace(/([^a-z$_]|^)(0x[\\dA-F]+|\\d+(?:\\.\\d*)?|\\.\\d+)(?!e)/gi, (matchStr, negativeMatchBit, numStr)=> {
		var n = parseFloat(numStr);
		if (Math.random() < mutation_chance) { n += 1; }
		if (Math.random() < mutation_chance) { if(n - 1 < 0 && n >= 0) { return negativeMatchBit + "(" + (n - 1) + ")"; } n -= 1; }
		if (Math.random() < mutation_chance) { n /= 2; }
		if (Math.random() < mutation_chance) { n *= 2; }
		if (isNaN(n)) { console.log("somehow got "+n+" from "+JSON.stringify(numStr)); n = numStr; }
		return negativeMatchBit + n;
	});
	textarea.focus();
	setTimeout(function(){
		textarea.select();
		document.execCommand("InsertText", false, new_code);
		compile(new_code);
	});
};
