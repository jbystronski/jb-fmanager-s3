exports.Node = class {
  constructor({
    id,

    original_id = null,

    parent_id = null,
    children = [],
    dir = false,
    info,
  }) {
    this.id = id;

    this.original_id = original_id || id;

    this.parent_id = parent_id;
    this.dir = dir;

    this.children = children;
    this.info = info;
  }

  get isLeaf() {
    return this.children.length === 0;
  }

  get hasChildren() {
    return !this.isLeaf;
  }

  get _id() {
    return this.id;
  }
};
