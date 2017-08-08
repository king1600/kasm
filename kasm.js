class Scope {
  constructor(name) {
    this.name = name;
    this.caller = null;
    this.symbols = {};
    this.functions = {};
  }
}

module.exports = class KSM_Context {
  constructor(stdout, verbose, debug) {
    this.stdout = stdout || console.log;
    this.verbose = verbose || false;
    this.scopes = [new Scope('global')];
    this.maxRecursionDepth = 4096; this.recursionDepth = 0;
    this.debug = debug || ((...args) => this.stdout(...args));
    this.$ = 0, this.rxx = 0, this.reg = 0; this.null = 0;
    this.stack = [], this.context = []; this.skipScope = false;
    this.keywords = ['$','reg','rxx','begin','end','fbegin','fend','null','pop'];
  }
  scope() {
    return this.scopes[this.scopes.length - 1];
  }
  push(value) {
    this.stack.push(value);
    return value;
  }
  pop() {
    if (this.stack.length === 0) throw 'Stack is empty!';
    return this.stack.pop();
  }
  searchUp(key, value) {
    for (let i = this.scopes.length - 1; i > -1; i--)
      if (Object.keys(this.scopes[i][key]).includes(value))
        return this.scopes[i][key][value];
    return null;
  }
  jump(label) {
    if (label === '$')
      throw `Cannot jump to current pointer (infinite loop)`;
    else if (['begin','end','fbegin','fend'].includes(label))
      this.$ = this.get(label);
    else if (this.searchUp('functions', label))
      this.$ = this.searchUp('functions', label).pos;
    else if (this.searchUp('symbols', label))
      this.$ = this.searchUp('symbols', label).pos;
    else if (!isNaN(label))
      this.$ = parseInt(label);
  }
  exec(code, on_line = (ctx, line)=>{}) {
    for (let line of code.split('\n')) {
      line = line.split(';')[0].trimLeft().trimRight();
      on_line(this, line);
      if (line.length < 1 || line[0] === ';') continue;
      this.context.push(line);
    }
    let line = this.$ + 1;
    while (this.$ < this.context.length) {
      line = this.$ + 1;
      try {
        this.eval(this.context[this.$]);
        this.$++;
        if (line - 1 === this.$)
          throw 'Infinite loop detected';
      } catch (msg) {
        throw new Error(`Error on line:${line} (${this.context[line-1]}) ${msg}`);
      }
    }
  }
  set(item, value) {
    if (item === 'reg')
      this.reg = value;
    else if (item === '$')
      this.$ = isNaN(value) ? this.$ : parseInt(value);  
    else if (item === 'rxx')
      this.rxx = value;
    else if (this.searchUp('symbols', item))
      this.searchUp('symbols', item).value = value;
    else this.rxx = value;
    if (this.$ < -1) this.$ = -1;
  }
  call(name) {
    let func = this.searchUp('functions', name);
    if (func === null)
      throw `Function (${name}) does not exist in scope!`;
    if (this.recursionDepth >= this.maxRecursionDepth)
      throw `Max recursion depth (${this.maxRecursionDepth}) exceeded!`;
    func.scope.caller = this.$;
    func.scope.functions[func.scope.name] = 
      {scope: new Scope(func.scope.name), pos: func.pos};
    this.$ = func.pos;
    this.scopes.push(func.scope);
    return this.recursionDepth++;
  }
  get(value) {
    const _get = () => {
      if (!value && value !== 0) value = '';
      if (this.keywords.includes(value)) {
        if (value === 'pop') return this.pop();
        else if (value === 'null') return 0;
        else if (value === 'begin') return 0;
        else if (value === '$') return this.$;
        else if (value === 'reg') return this.reg;
        else if (value === 'rxx') return this.rxx;
        else if (value === 'end') return this.context.length;
        else if (value === 'fbegin') {
          if (this.scope().name === 'global') return -1;
          return this.searchUp('functions', this.scope().name).pos;
        } else if (value === 'fend') {
          for (let i = this.$; i < this.context.length; i++)
            if (this.context[i].split(' ')[0].toUpperCase() === 'ret')
              return i - 1;
          return this.context.length;
        } else if (value === 'fbegin') {
          console.log('getting begin');
          console.log(this.scope())
        }
        else throw 'Register does not exist!';
      } else if (this.searchUp('symbols', value))  {
        return this.searchUp('symbols', value).value;
      } else return !isNaN(value) ? parseInt(value) : 
        (value.startsWith('"') && value.endsWith('"') ?
          value.split('').slice(1).slice(0, -1).join('') : null);
    };
    const _value = _get();
    if (_value === null) throw `Symbol (${value}) does not exist in scope`;
    return _value;
  }
  static keywords() {
    return ['ret','pop','out','call','ccal',
      'push','set','mov','func','del','jmp',
      'jcp','cmp','ne','lt','le','gt','get',
      'add','sub','div','mul'];
  }
  eval(line) {
    let [cmd, ...args] = line.split(' ');
    let [farg, ...sargs] = args.join(' ').match(/("[^"]*")|[^,]+/g);
    args = [farg, sargs.join(',')]
      .filter(i => i.length > 0).map(i => i.trimLeft().trimRight());
    if (args.length < 1) throw 'No arguments provided';
    
    if (cmd.toUpperCase() === 'RET') {
      if (this.skipScope)
        return (this.skipScope = false);
      if (this.verbose) this.debug(cmd, args);
      this.set('rxx', this.get(args[0]));
      this.$ = this.scopes.pop().caller;
      return this.recursionDepth--;
    }
    
    if (this.skipScope) return;
    if (this.verbose) this.debug(cmd, args);
    switch (cmd.toUpperCase()) {
      case 'POP': {
        return this.set(this.pop());
      }
      case 'OUT': {
        return this.stdout(this.get(args[0]));
      }
      case 'CALL': {
        return this.call(args[0]);
      }
      case 'CCAL': {
        return (this.rxx !== 0 ? this.call(args[0]) : null);
      }
      case 'PUSH': {
        this.push(this.get(args[0]));
        return args.length > 1 ? this.push(this.get(args[1])) : null; 
      }
      case 'SET': {
        if (args[0] in this.scope().symbols)
          throw `Symbol ${args[0]} already exists in scope!`;
        return (this.scope().symbols[args[0]] = 
          {value: this.get(args[1]) || 0, pos: this.$});
      }
      case 'MOV': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        return this.set(args[0], this.get(args[1]));
      }
      case 'FUNC': {
        if (!isNaN(args[0][0]))
          throw `Function names cannot begin with numbers! (${args[0]})`;
        if (args[0] === this.scope().name)
          throw `Cannot create function ${args[0]} with same name as current context`;
        this.scope().functions[args[0]] = 
          {scope: new Scope(args[0]), pos: this.$};
        return (this.skipScope = true);
      }
      case 'DEL': {
        if (this.keywords.includes(args[0]))
          throw `Cannot delete register ${args[0]}`;
        if (this.searchUp('symbols', args[0]))
          for (let i = this.scopes.length - 1; i > -1; i--)
            if (Object.keys(this.scopes[i].symbols).includes(args[0]))
              return (delete this.scopes[i].symbols[args[0]]);
      }
      case 'JMP': {
        this.jump(args[0]);
        return (this.rxx = 0);
      }
      case 'JCP': {
        this.rxx !== 0 ? this.jump(args[0]) : null;
        return (this.rxx = 0);
      }
      case 'CMP': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        return (this.rxx = (this.get(args[0]) === this.get(args[1]) ? 1 : 0));
      }
      case 'NE': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        return (this.rxx = (this.get(args[0]) !== this.get(args[1]) ? 1 : 0));
      }
      case 'LT': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        return (this.rxx = (this.get(args[0]) < this.get(args[1]) ? 1 : 0));
      }
      case 'LE': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        return (this.rxx = (this.get(args[0]) <= this.get(args[1]) ? 1 : 0));
      }
      case 'GT': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        return (this.rxx = (this.get(args[0]) > this.get(args[1]) ? 1 : 0));
      }
      case 'GE': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        return (this.rxx = (this.get(args[0]) >= this.get(args[1]) ? 1 : 0));
      }
      case 'ADD': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        this.rxx = this.get(args[0]) + this.get(args[1]);
        return this.set(args[0], this.rxx);
      }
      case 'SUB': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        this.rxx = this.get(args[0]) - this.get(args[1]);
        return this.set(args[0], this.rxx);
      }
      case 'MUL': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        this.rxx = this.get(args[0]) * this.get(args[1]);
        return this.set(args[0], this.rxx);
      }
      case 'DIV': {
        if (args.length < 2)
          throw `Expected 2 arguments, received: ${args[0]}`;
        this.rxx = this.get(args[0]) / this.get(args[1]);
        return this.set(args[0], this.rxx);
      }
      default: {
        throw `Invalid instruction (${cmd})`;
      }
    }
  }
}