const { Node } = require("./Node");

exports.Tree = class {
  constructor(id) {
    this.root = new Node({ id });
  }

  *preOrderTraversal(node = this.root) {
    yield node;
    if (node.children.length) {
      for (let child of node.children) {
        yield* this.preOrderTraversal(child);
      }
    }
  }

  *postOrderTraversal(node = this.root) {
    if (node.children.length) {
      for (let child of node.children) {
        yield* this.postOrderTraversal(child);
      }
    }
    yield node;
  }

  insert({ parentNodeId, id, originalId, children = [], dir, info }) {
    for (let node of this.preOrderTraversal()) {
      if (node.id === parentNodeId) {
        const newNode = new Node({
          id,
          original_id: originalId,

          parent_id: node.id,
          children,
          dir,
          info,
        });

        node.children.push(newNode);
        return newNode;
      }
    }
    return false;
  }

  remove(id) {
    for (let node of this.preOrderTraversal()) {
      const filtered = node.children.filter((c) => c.id !== id);
      if (filtered.length !== node.children.length) {
        node.children = filtered;
        return true;
      }
    }
    return false;
  }

  find(prop, name = "id") {
    for (let node of this.preOrderTraversal()) {
      if (node[name] === prop) return node;
    }
    return undefined;
  }
};
