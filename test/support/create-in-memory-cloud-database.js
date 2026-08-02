function createInMemoryCloudDatabase(seed = {}) {
  const collections = new Map(
    Object.entries(seed).map(([name, documents]) => [
      name,
      new Map(
        documents.map((document) => [
          document._id,
          structuredClone(document),
        ]),
      ),
    ]),
  );
  let transactionQueue = Promise.resolve();

  function getCollectionDocuments(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }

    return collections.get(name);
  }

  function matches(document, query) {
    return Object.entries(query).every(
      ([field, value]) => document[field] === value,
    );
  }

  function collection(name) {
    const documents = getCollectionDocuments(name);

    return {
      where(query) {
        const getMatches = () =>
          [...documents.values()].filter((document) =>
            matches(document, query),
          );

        return {
          async get() {
            return {
              data: getMatches().map((document) =>
                structuredClone(document),
              ),
            };
          },
          limit(limit) {
            return {
              async get() {
                return {
                  data: getMatches()
                    .slice(0, limit)
                    .map((document) =>
                      structuredClone(document),
                    ),
                };
              },
            };
          },
        };
      },
      doc(id) {
        return {
          async get() {
            const document = documents.get(id);
            return {
              data: document ? structuredClone(document) : null,
            };
          },
          async set({ data }) {
            documents.set(id, {
              _id: id,
              ...structuredClone(data),
            });
          },
          async remove() {
            documents.delete(id);
          },
        };
      },
    };
  }

  return {
    collection,
    runTransaction(handler) {
      const operation = transactionQueue.then(() =>
        handler({
          collection,
        }),
      );
      transactionQueue = operation.catch(() => {});
      return operation;
    },
    read(name, id) {
      const document = getCollectionDocuments(name).get(id);
      return document ? structuredClone(document) : null;
    },
    list(name) {
      return [...getCollectionDocuments(name).values()].map(
        (document) => structuredClone(document),
      );
    },
  };
}

module.exports = {
  createInMemoryCloudDatabase,
};
