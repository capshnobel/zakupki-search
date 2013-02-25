(function(module) {
    var obfuscationTable = {
        'е': 'e',
        'Е': 'E',
        'Т': 'T',
        'У': 'Y',
        'у': 'y',
        'и': 'u',
        'о': 'o',
        'О': ['O', '0'],
        'р': 'p',
        'Р': 'P',
        'а': 'a',
        'А': 'a',
        'Н': 'H',
        'к': 'k',
        'К': 'K',
        'х': 'x',
        'Х': 'X',
        'с': 'c',
        'С': 'C',
        'В': 'B',
        'п': 'n',
        'т': 'm',
        'М': 'M',
        'З': '3'
    };

    /**
     * In the given string of text, finds characters, which are possible to
     * obfuscate and if succeeded, returns an object, which contains three
     * array properties:
     *
     * {Number[]} positions. Values are indicies into the original string, where
     * obfuscable characters were found.
     *
     * {String[]} characters. Values are obfuscable characters from the original
     * string.
     *
     * {String[]|String[][]} obfuscations. Values are possible obfuscations:
     * either individual characters, or arrays of characters, if it is possible
     * to obfuscate one original character with many.
     *
     * If it could not find any possible obfuscations, it will return undefined.
     *
     * @param {String} text
     * @returns {Object}
     */
    function figureTextObfuscationStatus(text) {
        var positions = [],
            i = 0,
            char = null,
            chars = [],
            obfuscations = [];

        if(!text || !text.charAt)
            return undefined;

        for(; i < text.length; ++i) {
            char = text.charAt(i);
            if(char in obfuscationTable) {
                positions.push(i);
                chars.push(char);
                obfuscations.push(obfuscationTable[char]);
            }
        }

        if(char === null)
            return undefined;

        return {
            positions: positions,
            characters: chars,
            obfuscations: obfuscations
        };
    }

    /**
     * Generates obfuscated versions of the text given, which it returns in an
     * array(which will be empty if no versions were produced). Optionally, may
     * be given a hint - an obfuscation info object, such as one, generated
     * by the {@link figureTextObfuscationStatus}.
     *
     * @param {String} fromText
     * @param {Object} [obfuscationInfoHint]
     * @param {Function} [progressCb]
     * @returns {String[]}
     */
    function generateObfuscatedText(fromText, obfuscationInfoHint, progressCb) {
        var obfuscationInfo = obfuscationInfoHint ||
                                figureTextObfuscationStatus(fromText),
            result = [],
            i = 0;
        if(!obfuscationInfo) {
            return result;
        }

        result = generate(fromText, obfuscationInfo, progressCb);

        // post-process the results
        for(; i < result.length; ++i) {
            obfuscationInfo = figureTextObfuscationStatus(result[i]);
            if(obfuscationInfo) {
                generate(result[i],
                         obfuscationInfo,
                         progressCb).forEach(function(version) {
                    if(result.indexOf(version) === -1) {
                        result.push(version);
                    }
                });

            }
        }

        return result;
    }

    function generate(text, info, progressCb) {
        var res = [];
        info.positions.forEach(function(pos, index) {
            var obfuscation = info.obfuscations[index];
            if(Array.isArray(obfuscation)) {
                obfuscation.forEach(function(obfuscation) {
                    res.push(replace(text, pos, obfuscation));

                    if(typeof progressCb === 'function') {
                        progressCb();
                    }
                });
            } else {
                res.push(replace(text, pos, obfuscation));
                if(typeof progressCb === 'function') {
                    progressCb();
                }
            }
        });

        return res;
    }

    /**
     * Returns a copy of the string, with a character replaced at a given position.
     *
     * @param {String} string
     * @param {Number} pos
     * @param {String} replacement
     *
     * @returns {String}
     */
    function replace(string, pos, replacement) {
        if(typeof(pos) !== 'number' || typeof(replacement) !== 'string')
            return string;

        return string.slice(0, pos) + replacement +
               string.slice(pos + replacement.length);
    }

    module.figureTextObfuscationStatus = figureTextObfuscationStatus;
    module.generateObfuscatedText = generateObfuscatedText;
})(((this.module && this.module.exports) || this.exports)
        || (this.Rospil || (this.Rospil = {})));
