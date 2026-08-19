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
        const orders = [];
        let maximum;
        let skipped = 0;
        const queryBuilder = {
          orderBy(field, direction) {
            orders.push({ field, direction });
            return queryBuilder;
          },
          limit(limit) {
            maximum = limit;
            return queryBuilder;
          },
          skip(count) {
            skipped = count;
            return queryBuilder;
          },
          async get() {
            const result = getMatches().sort((left, right) => {
              for (const { field, direction } of orders) {
                const leftValue = left[field];
                const rightValue = right[field];
                const difference =
                  leftValue instanceof Date && rightValue instanceof Date
                    ? leftValue.getTime() - rightValue.getTime()
                    : leftValue < rightValue
                      ? -1
                      : leftValue > rightValue
                        ? 1
                        : 0;

                if (difference !== 0) {
                  return direction === "desc" ? -difference : difference;
                }
              }

              return 0;
            });
            const skippedResult = result.slice(skipped);
            const limited =
              maximum === undefined
                ? skippedResult
                : skippedResult.slice(0, maximum);
            return {
              data: limited.map((document) =>
                structuredClone(document),
              ),
            };
          },
        };

        return queryBuilder;
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
