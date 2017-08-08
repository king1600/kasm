const kasm = require('./kasm.js');
const Lexer = require('lex');

const KSM_sComments = [';(.*)'];
const KSM_sPunctuation = ['\\(','\\)','\\.','\\,','\\='];
const KSM_sKeywords = kasm.keywords().concat(['do','end'])

class KSM_ScriptContext {
  constructor(...args) {
    this.tab = 0;
    this.line = 1;
    this.ctx = new kasm(...args);
  }

  feed(data) {
    let lineno = 0, chunk, items;
    let code = [], chunks = [], depth = 0;
    try {
      for (let line of data.split('\n')) {
        lineno++;
        items = this._lex(line);
        while (items.length > 0) {
          chunk = items.shift();
          chunks.push(chunk);
          if (chunk.type === 'Keyword' && chunk.value === 'do') {
            depth++;
          } else if (chunk.type === 'Keyword' && chunk.value === 'end') {
            if (depth === 0) { chunks.pop(); this._parse(code, chunks); chunks = []; }
            else depth--;
          }
        }
      }
    } catch (message) {
      throw new Error(`CompileError on line:${lineo} - ${message}`);
    }
  }

  _regex(types, opts = '|') {
    const str = types.reduce((acc, val) => acc + val + opts, "");
    return new RegExp(str.slice(0, -1));
  }

  _push(code, text) {
    let spacing = Array.from(Array(this.tabs).keys())
      .reduce((tab, i) => tab += '  ', '');
    code.push(`${spacing}${text}`);
  }

  _lex(data) {
    let value, results = [];
    let lexer = new Lexer()
      .addRule(/\n/, () => {
      }).addRule(this._regex(KSM_sKeywords, "\\b|"), term => {
        return { type: 'Keyword', value: term };
      }).addRule(this._regex(KSM_sPunctuation), term => {
        return { type: 'Punc', value: term };
      }).addRule(this._regex(KSM_sComments), term => {
        return { type: 'Comment', value: term };
      }).addRule(/\w+\b/, term => {
        return { type: 'Id', value: term };
      }).addRule(/[\s\S]/, term => {
        return undefined;
      });
    lexer.input = data;
    do { value = lexer.lex(); results.push(value); } while (value);
    return results.slice(0, -1);
  }

  _until(chunks, cond) {
    let i = 0;
    for (let chunk of chunks) {
      if (cond(chunk)) break;
      else i++;
    }
    return [chunks.slice(0, i), chunks.slice(i)];
  }

  _parse(code, chunks) {
    console.log('Parsing:', chunks);
    if (chunks[0].type === 'Keyword') {
      switch (chunks[0].value) {
        case 'func': {
          let params = this._until(chunks.slice(1), c => 
            c.type === 'Keyword' && c.value === 'do');
          [params, chunks] = params;
          console.log('Params:', params);
          this._push(code, `func ${params[0]}`);
          if (!(params[1].type === 'Punc' && params[1].value === '('))
            throw `Expected "(" after "${params[0].value}"`;
          if (!(params.slice(-1)[0].type === 'Punc' && params.slice(-1)[0].value === ')'))
            throw `Expected ")" after "${params.slice(-2)[0].value}"`;
          params = params.filter(i => i.type !== 'Punc').map(i => i.value);
          this.tab++;
          this._push(code, ``)
        }
        case 'call': {

        }
        default: {

        }
      }
    } else if (chunks[0].type === 'Id') {

    }
  }
};

let ctx = new KSM_ScriptContext(console.log, true);
ctx.feed(`
func sum(x, y) do
  add x, y, end
end

res = call sum(5, 6) end
out res end
`)
