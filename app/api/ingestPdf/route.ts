import { NextResponse } from 'next/server';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import prisma from '@/utils/prisma';
import { getAuth } from '@clerk/nextjs/server';
import { loadEmbeddingsModel } from '../utils/embeddings';
import { loadVectorStore } from '../utils/vector_store';
import { type MongoClient } from 'mongodb';

export async function POST(request: Request) {
  console.log("ingesting PDF...")
  let mongoDbClient: MongoClient | null = null;

  console.log("awaiting request.json()...")
  const { fileUrl, fileName, vectorStoreId } = await request.json();
  
  console.log("awaiting auth")
  const { userId } = getAuth(request as any);
  
  if (!userId) {
    return NextResponse.json({ error: 'You must be logged in to ingest data' });
  }

  console.log("awaiting prisma.doc.count")
  const docAmount = await prisma.document.count({
    where: {
      userId,
    },
  });

  if (docAmount > 3) {
    return NextResponse.json({
      error: 'You have reached the maximum number of documents',
    });
  }
  console.log("awaiting prisma.doc.create")
  const doc = await prisma.document.create({
    data: {
      fileName,
      fileUrl,
      userId,
    },
  });

  console.log(`document contents:${JSON.stringify(doc)}`)
  console.log(`document ID:${doc.id}`)

  const namespace = doc.id;

  try {
    /* load from remote pdf URL */
    const response = await fetch(fileUrl);
    const buffer = await response.blob();
    const loader = new PDFLoader(buffer);
    const rawDocs = await loader.load();

    /* Split text into chunks */
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1500,
      chunkOverlap: 120,
    });
    const splitDocs = await textSplitter.splitDocuments(rawDocs);
    // Necessary for Mongo - we'll query on this later.
    for (const splitDoc of splitDocs) {
      splitDoc.metadata.docstore_document_id = namespace;
    }

    console.log('creating vector store...');

    /* create and store the embeddings in the vectorStore */
    const embeddings = loadEmbeddingsModel();

    console.log('creating vector store...');
    const store = await loadVectorStore({
      namespace: namespace,
      embeddings,
    });
    const vectorstore = store.vectorstore;
    console.log(`vectorStore contents: ${JSON.stringify(vectorstore)}`)
    if ('mongoDbClient' in store) {
      mongoDbClient = store.mongoDbClient;
    }

    // embed the PDF documents
    console.log(`awaiting vectorstore.addDocuments: ${splitDocs.length}`)
    // app timeout at addDocuments
    await vectorstore.addDocuments(splitDocs);
    console.log(`FINISHED vectorstore.addDocuments: ${splitDocs.length}`)
  } catch (error) {
    console.log('error', error);
    return NextResponse.json({ error: 'Failed to ingest your data' });
  } finally {
    if (mongoDbClient) {
      await mongoDbClient.close();
    }
  }

  return NextResponse.json({
    text: 'Successfully embedded pdf',
    id: namespace,
  });
}
