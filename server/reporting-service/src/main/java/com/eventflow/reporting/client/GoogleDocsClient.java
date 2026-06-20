package com.eventflow.reporting.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@Slf4j
public class GoogleDocsClient {

    private final String documentId;

    public GoogleDocsClient(@Value("${google.docs.document-id}") String documentId) {
        this.documentId = documentId;
    }

    /**
     * Simulates writing document content to Google Docs API.
     * Returns the configured URL pointing to the document.
     */
    public String createDocument(String title, String markdownContent) {
        log.info("Google Docs API Invoked: Creating/updating document '{}' (ID: {})", title, documentId);
        log.debug("Document content details:\n{}", markdownContent);

        String docUrl = "https://docs.google.com/document/d/" + documentId + "/edit";
        log.info("Document successfully referenced at: {}", docUrl);
        return docUrl;
    }
}
